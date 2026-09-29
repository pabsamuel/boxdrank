import type { CultureInput } from '@perde/shared';

export const cultureEn: CultureInput = {
  id: 'en',
  name: { tr: 'Punch ve Judy', en: 'Punch and Judy' },
  tradition: 'Punch and Judy (glove puppets)',
  region: 'England',
  lang: 'en-GB',
  description: {
    tr: 'İngiliz sahil kasabalarının çizgili kulübelerinde oynanan el kuklası gösterisi. Kambur ve gaga burunlu Mr. Punch, sosisleri çalan timsah ve bitmeyen "That\'s the way to do it!"',
    en: 'The glove-puppet show of England\'s striped seaside booths. Hook-nosed Mr Punch, a sausage-stealing crocodile and the endless cry of "That\'s the way to do it!"',
  },
  heritage: {
    tr: "İtalyan commedia dell'arte karakteri Pulcinella'dan türedi; İngiltere'de ilk kaydı 1662, Samuel Pepys'in günlüğü. Perde tokatlı sahneleri şakaya çevirir.",
    en: "Descended from the commedia dell'arte's Pulcinella; first recorded in England in Samuel Pepys's diary, 1662. Perde turns the slapstick into jokes.",
  },
  stage: {
    kind: 'booth',
    backdrop: '#b3241f',
    glow: '#ffd9a8',
    ground: '#5a2e12',
    text: '#fff6e5',
    puppetOpacity: 1,
    blur: 0,
  },
  defaultSeats: [
    { seat: 'punch', puppetId: 'punch', name: 'Mr Punch' },
    { seat: 'judy', puppetId: 'judy', name: 'Judy' },
    { seat: 'crocodile', puppetId: 'crocodile', name: 'Crocodile' },
    { seat: 'constable', puppetId: 'constable', name: 'Constable' },
  ],
  premium: true,
};
