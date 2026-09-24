// The guided tour: one viewpoint per installation, in the order of the floor
// navigation arrows of the original space. `sound` is the sound name of the
// installation's FRAGMENT/SILENCE button in scene.json; it starts on arrival.
// `video` is the label of a clip with sound that plays on arrival instead. Titles
// are the names the artist gave the pieces in Wonda.
//
// Each stop is shown as its own world: only the pieces nearest to its `target`
// are visible. `env` is 'void' (black space) or 'sky' (open air under the
// panorama); `accent` tints the floor glow and the floating dust.

export const STOPS = [
  {
    title: 'VÄLI',
    env: 'void',
    accent: '#8fa3c7',
    subtitle: '',
    video: 'Intro.mp4',
    position: [0.25, 1.6, 0.6],
    target: [0.25, 1.62, -3.01],
  },
  {
    title: 'Windows',
    env: 'void',
    accent: '#d23b3b',
    subtitle: 'Show me which window you fell out of.',
    sound: 'Okna_music.mp3',
    position: [2.9, 1.7, 0.3],
    target: [8.5, 2.2, 0.5],
  },
  {
    title: 'Stone island',
    env: 'void',
    accent: '#b9c3d6',
    subtitle: 'Who will judge us? Who draw the line?',
    sound: 'камни.mp3',
    position: [3.3, 1.7, -5.9],
    target: [9.0, 2.0, -5.9],
  },
  {
    title: 'Forbidden island',
    env: 'void',
    accent: '#e0612d',
    subtitle: 'Shut up! It’s my life!',
    sound: 'ShutUp_1.mp3',
    position: [2.2, 1.6, -6.5],
    target: [-2.8, 1.5, -6.5],
  },
  {
    title: 'Glitch',
    env: 'void',
    accent: '#7fe0ff',
    subtitle: 'Where am I? Who am I?',
    sound: 'Glitch.mp3',
    position: [1.6, 1.6, -10.6],
    target: [-0.4, 1.8, -14.3],
  },
  {
    title: 'Loneliness',
    env: 'sky',
    accent: '#9a7fd1',
    subtitle: '',
    sound: 'Sorm.mp3',
    position: [5.2, 1.8, -17.7],
    target: [9.2, 2.4, -23.5],
  },
  {
    title: 'Thirst',
    env: 'sky',
    accent: '#f2d7a6',
    subtitle: '',
    sound: 'Relax_music.mp3',
    position: [-1.0, 1.7, -19.2],
    target: [-6.3, 2.4, -24.5],
  },
  {
    title: 'Dances',
    env: 'void',
    accent: '#b6e05a',
    subtitle: '',
    sound: 'Dance_music.mp3',
    position: [-4.2, 1.6, -12.9],
    target: [-9.8, 1.8, -13.0],
  },
  {
    title: 'Hahmo',
    env: 'sky',
    accent: '#9d8cff',
    subtitle: 'Go. Live. Feel. I’ll be here.',
    position: [-14.0, 1.6, -5.6],
    target: [-19.2, 1.5, -3.6],
  },
];

// Pieces that sit closer to another stop's viewpoint than to their own.
export const ASSIGN = {
  'Надпись-01.png': 'Forbidden island',
};

// Parts of the free-walk space that have no place in the tour: the room shell,
// the black floor plate that darkened it, the floor navigation arrows, and the
// sound buttons (sounds start by themselves).
export const HIDDEN = (el) =>
  el.label === 'Пространство' || el.label === 'черный.png'
  || el.label.startsWith('навигация') || !!el.sound;
