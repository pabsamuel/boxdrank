import { describe, expect, it } from 'vitest';
import {
  handleClose,
  handleMessage,
  type Peer,
  type PeerIdentity,
  type RoomContext,
} from './room-core';
import type { ServerMsg } from './protocol';

class FakePeer implements Peer {
  role?: PeerIdentity['role'];
  seat?: string;
  name?: string;
  sent: ServerMsg[] = [];
  closed?: { code: number; reason: string };
  constructor(public id: string) {}
  send(msg: ServerMsg) {
    this.sent.push(msg);
  }
  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
  setIdentity(identity: PeerIdentity) {
    Object.assign(this, identity);
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
}

function room(...peers: FakePeer[]): RoomContext {
  return { code: 'ABCD', peers: peers.filter((p) => !p.closed) };
}

const send = (ctx: RoomContext, p: FakePeer, msg: unknown) =>
  handleMessage(ctx, p, JSON.stringify(msg));

describe('room routing', () => {
  it('welcomes a stage and lists existing controllers', () => {
    const stage = new FakePeer('s');
    const phone = new FakePeer('p1');
    send(room(stage, phone), phone, {
      t: 'hello',
      role: 'controller',
      seat: 'karagoz',
      name: 'Baba',
    });
    expect(phone.last()).toMatchObject({
      t: 'welcome',
      role: 'controller',
      seat: 'karagoz',
      stageConnected: false,
    });
    send(room(stage, phone), stage, { t: 'hello', role: 'stage' });
    expect(stage.last()).toMatchObject({
      t: 'welcome',
      role: 'stage',
      code: 'ABCD',
      peers: [{ seat: 'karagoz', name: 'Baba' }],
    });
    expect(phone.last()).toEqual({ t: 'stage', online: true });
  });

  it('forwards controller input to the stage stamped with the seat', () => {
    const stage = new FakePeer('s');
    const phone = new FakePeer('p1');
    const ctx = room(stage, phone);
    send(ctx, stage, { t: 'hello', role: 'stage' });
    send(ctx, phone, { t: 'hello', role: 'controller', seat: 'hacivat' });
    expect(stage.last()).toEqual({ t: 'joined', seat: 'hacivat', name: undefined });
    const pose = { x: 0.5, y: 0, lean: -0.2, arm: 1, talking: true };
    send(ctx, phone, { t: 'pose', pose });
    expect(stage.last()).toEqual({ t: 'pose', pose, seat: 'hacivat' });
    send(ctx, phone, { t: 'speech', transcript: 'yar bana bir eğlence', final: false });
    expect(stage.last()).toMatchObject({ t: 'speech', seat: 'hacivat', final: false });
    expect(phone.sent.filter((m) => m.t === 'pose')).toHaveLength(0);
  });

  it('fans stage state out to every controller and not back to the stage', () => {
    const stage = new FakePeer('s');
    const p1 = new FakePeer('p1');
    const p2 = new FakePeer('p2');
    const ctx = room(stage, p1, p2);
    send(ctx, stage, { t: 'hello', role: 'stage' });
    send(ctx, p1, { t: 'hello', role: 'controller', seat: 'karagoz' });
    send(ctx, p2, { t: 'hello', role: 'controller', seat: 'hacivat' });
    const state = {
      mode: 'lobby',
      cultureId: 'tr',
      karaoke: true,
      leniency: 'kids',
      plan: 'plus',
      seats: [],
      play: null,
    };
    send(ctx, stage, { t: 'state', state });
    expect(p1.last()).toEqual({ t: 'state', state });
    expect(p2.last()).toEqual({ t: 'state', state });
    expect(stage.sent.filter((m) => m.t === 'state')).toHaveLength(0);
  });

  it('rejects messages before hello and malformed frames', () => {
    const p = new FakePeer('p');
    expect(
      send(room(p), p, { t: 'pose', pose: { x: 0, y: 0, lean: 0, arm: 0, talking: false } }),
    ).toBe(false);
    expect(p.last()).toMatchObject({ t: 'error', code: 'not-introduced' });
    expect(handleMessage(room(p), p, '{not json')).toBe(false);
    expect(p.last()).toMatchObject({ t: 'error', code: 'bad-message' });
    expect(
      send(room(p), p, { t: 'pose', pose: { x: 5, y: 0, lean: 0, arm: 0, talking: false } }),
    ).toBe(false);
  });

  it('controllers need a seat and rooms have a capacity', () => {
    const p = new FakePeer('p');
    expect(send(room(p), p, { t: 'hello', role: 'controller' })).toBe(false);
    expect(p.last()).toMatchObject({ t: 'error', code: 'seat-required' });
    const phones = ['a', 'b', 'c', 'd', 'e'].map((id) => new FakePeer(id));
    phones.forEach((ph, i) =>
      send(room(...phones), ph, { t: 'hello', role: 'controller', seat: `seat${i}` }),
    );
    expect(phones[4]!.last()).toMatchObject({ t: 'error', code: 'room-full' });
  });

  it('a reloaded phone replaces the old socket on its seat', () => {
    const stage = new FakePeer('s');
    const old = new FakePeer('old');
    const fresh = new FakePeer('fresh');
    const ctx = room(stage, old, fresh);
    send(ctx, stage, { t: 'hello', role: 'stage' });
    send(ctx, old, { t: 'hello', role: 'controller', seat: 'karagoz' });
    send(ctx, fresh, { t: 'hello', role: 'controller', seat: 'karagoz' });
    expect(old.closed?.code).toBe(4001);
    expect(fresh.last()).toMatchObject({ t: 'welcome', seat: 'karagoz' });
    // The old socket's close must not announce the seat as left.
    handleClose(room(stage, fresh), old);
    expect(stage.sent.filter((m) => m.t === 'left')).toHaveLength(0);
  });

  it('announces departures', () => {
    const stage = new FakePeer('s');
    const p = new FakePeer('p');
    const ctx = room(stage, p);
    send(ctx, stage, { t: 'hello', role: 'stage' });
    send(ctx, p, { t: 'hello', role: 'controller', seat: 'karagoz' });
    handleClose(room(stage), p);
    expect(stage.last()).toEqual({ t: 'left', seat: 'karagoz' });
    handleClose(room(p), stage);
    expect(p.last()).toEqual({ t: 'stage', online: false });
  });

  it('answers ping', () => {
    const p = new FakePeer('p');
    send(room(p), p, { t: 'ping' });
    expect(p.last()).toEqual({ t: 'pong' });
  });
});
