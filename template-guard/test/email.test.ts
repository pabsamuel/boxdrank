import { describe, expect, it } from 'vitest';
import { EmailSink, assertAddress, createSmtpMailer, renderAlertEmail } from '../src/drift/email.js';
import type { DriftNotification } from '../src/drift/scheduler.js';

const alert: DriftNotification = {
  accountId: '42',
  templateBoardId: '1',
  copyBoardId: '2',
  message: '“Acme Onboarding” has a connect column pointing at the wrong board.',
  severity: 'miswired',
  copyBoardName: 'Acme Onboarding',
  boardUrl: 'https://agency.monday.com/boards/2',
};

function capture() {
  const sent: Record<string, unknown>[] = [];
  const factory = () => ({ sendMail: async (m: Record<string, unknown>) => void sent.push(m) });
  return { sent, factory };
}

describe('alert email', () => {
  it('names the board and links to it, in plain text', () => {
    const { subject, text } = renderAlertEmail(alert);
    expect(subject).toBe('Template Guard: “Acme Onboarding” has a miswired connect column');
    expect(text).toContain('https://agency.monday.com/boards/2');
    expect(text).toMatch(/turn off/);
  });

  it('keeps a board name with a line break out of the subject header', () => {
    const { subject } = renderAlertEmail({ ...alert, copyBoardName: 'Acme\r\nBcc: x@evil.test' });
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('sends to the account recipient through the mailer', async () => {
    const { sent, factory } = capture();
    const mailer = createSmtpMailer({ url: 'smtps://u:p@smtp.example.com:465', from: 'Template Guard <alerts@example.com>', transportFactory: factory });
    await new EmailSink(mailer, async () => 'admin@client.test').deliver(alert);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'admin@client.test', from: 'Template Guard <alerts@example.com>' });
  });

  it('fails visibly when there is no recipient, so the next channel is tried', async () => {
    const { factory } = capture();
    const mailer = createSmtpMailer({ url: 'smtps://u:p@smtp.example.com:465', from: 'alerts@example.com', transportFactory: factory });
    await expect(new EmailSink(mailer, async () => null).deliver(alert)).rejects.toThrow(/No email recipient/);
  });

  it('never leaks the SMTP password in an error', async () => {
    const mailer = createSmtpMailer({
      url: 'smtps://user:s3cr%40t@smtp.example.com:465',
      from: 'alerts@example.com',
      transportFactory: () => ({
        sendMail: async () => {
          throw new Error('auth failed for smtps://user:s3cr%40t@smtp.example.com:465 (password s3cr@t)');
        },
      }),
    });
    const err = await mailer.send({ to: 'a@b.test', subject: 's', text: 't' }).catch((e: Error) => e);
    expect(String(err)).not.toContain('s3cr');
  });

  it('refuses a non-SMTP URL and a header-injecting address', () => {
    expect(() => createSmtpMailer({ url: 'https://x.test', from: 'a@b.test' })).toThrow(/smtps/);
    expect(() => assertAddress('to', 'a@b.test\r\nBcc: c@d.test')).toThrow(/line break/);
  });
});
