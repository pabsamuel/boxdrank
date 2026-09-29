import type { PlayInput } from '@perde/shared';

/** "Punch and the Sausages": the classic crocodile routine, minus the beatings. */
export const sausages: PlayInput = {
  id: 'sausages',
  cultureId: 'en',
  lang: 'en-GB',
  title: 'Punch and the Sausages',
  subtitle: 'A seaside show',
  summary:
    'Judy leaves Mr Punch to mind the sausages. A crocodile has other plans, and the constable arrives one scene late.',
  ageRange: '4+',
  durationMin: 4,
  premium: true,
  source:
    'Traditional Punch and Judy routine (public domain); original adaptation for Perde without slapstick violence.',
  characters: [
    { seat: 'punch', name: 'Mr Punch', puppetId: 'punch', color: '#c8102e' },
    { seat: 'judy', name: 'Judy', puppetId: 'judy', color: '#1f4e8c' },
    { seat: 'crocodile', name: 'Crocodile', puppetId: 'crocodile', color: '#3c8d3f' },
    { seat: 'constable', name: 'Constable', puppetId: 'constable', color: '#2c3e50' },
  ],
  sections: [
    {
      id: 'sausages',
      title: 'The Sausages',
      lines: [
        { seat: 'punch', text: 'Hello boys and girls! It’s me, Mr Punch!', gesture: 'wave' },
        { seat: 'punch', text: 'That’s the way to do it!', gesture: 'jump' },
        { seat: 'judy', text: 'Mr Punch, mind the sausages while I’m out.' },
        { seat: 'punch', text: 'Sausages? I love sausages. Yes, Judy, I’ll mind them.' },
        { seat: 'judy', text: 'Mind them, don’t eat them!' },
        { seat: 'punch', text: 'Mind them, don’t eat them. Easy peasy.', gesture: 'nod' },
        { seat: 'judy', text: 'Back in a minute. Don’t do anything silly!' },
        { seat: 'punch', text: 'Me? Silly? Never!', gesture: 'nod' },
      ],
    },
    {
      id: 'crocodile',
      title: 'The Crocodile',
      lines: [
        { seat: 'crocodile', text: 'Snap, snap! Do I smell sausages?', gesture: 'shake' },
        { seat: 'punch', text: 'Go away, Mr Crocodile, these are Judy’s sausages.' },
        { seat: 'crocodile', text: 'Just one little sausage? Please?' },
        { seat: 'punch', text: 'No! Not one, not two, not any.', gesture: 'shake' },
        { seat: 'crocodile', text: 'Then I’ll take the whole string! Snap!', gesture: 'jump' },
        { seat: 'punch', text: 'Oi! Give those back, you big green handbag!' },
        { seat: 'crocodile', text: 'Come and get them! Snap, snap, snap!', gesture: 'spin' },
        { seat: 'punch', text: 'Boys and girls, which way did he go? That way?', gesture: 'wave' },
        { seat: 'punch', text: 'That’s the way to do it!', gesture: 'spin' },
      ],
    },
    {
      id: 'constable',
      title: 'The Constable',
      lines: [
        { seat: 'constable', text: 'Hello, hello, hello! What’s all this then?', gesture: 'bow' },
        { seat: 'punch', text: 'Constable! A crocodile has stolen our sausages!' },
        { seat: 'constable', text: 'A crocodile? In this town? I’ll need a description.' },
        { seat: 'punch', text: 'Green. Long. Teeth. Sausages in his mouth.' },
        {
          seat: 'constable',
          text: 'Ah, that narrows it down. Crocodile, you’re nicked!',
          gesture: 'wave',
        },
        {
          seat: 'crocodile',
          text: 'Nicked? I only wanted a snack. Here, have them back.',
          gesture: 'bow',
        },
        { seat: 'constable', text: 'Very good. Case closed. Anyone for a sausage?' },
      ],
    },
    {
      id: 'judy-returns',
      title: 'Judy Returns',
      lines: [
        { seat: 'judy', text: 'Mr Punch, I’m back! Where are my sausages?' },
        { seat: 'punch', text: 'The crocodile took them, the constable found them.' },
        { seat: 'judy', text: 'And you did nothing silly at all?' },
        { seat: 'punch', text: 'Nothing at all, Judy. That’s the way to do it!', gesture: 'jump' },
        { seat: 'judy', text: 'Oh, Mr Punch. Say goodbye, everybody!', gesture: 'wave' },
        {
          seat: 'punch',
          text: 'Goodbye, boys and girls! That’s the way to do it!',
          gesture: 'wave',
        },
      ],
    },
  ],
};
