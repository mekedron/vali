// The guided tour: one viewpoint per installation, in the order of the floor
// navigation arrows of the original space. `sound` is the sound name of the
// installation's FRAGMENT/SILENCE button in scene.json; it starts on arrival.
// `video` is the label of a clip with sound that plays on arrival instead. Titles
// are the names the artist gave the pieces in Wonda.

export const STOPS = [
  {
    title: 'VÄLI',
    subtitle: '',
    video: 'Intro.mp4',
    position: [0.25, 1.6, 0.6],
    target: [0.25, 1.62, -3.01],
  },
  {
    title: 'Windows',
    subtitle: 'Show me which window you fell out of.',
    sound: 'Okna_music.mp3',
    position: [2.9, 1.7, 0.3],
    target: [8.5, 2.2, 0.5],
  },
  {
    title: 'Stone island',
    subtitle: 'Who will judge us? Who draw the line?',
    sound: 'камни.mp3',
    position: [3.3, 1.7, -5.9],
    target: [9.0, 2.0, -5.9],
  },
  {
    title: 'Forbidden island',
    subtitle: 'Shut up! It’s my life!',
    sound: 'ShutUp_1.mp3',
    position: [2.2, 1.6, -6.5],
    target: [-2.8, 1.5, -6.5],
  },
  {
    title: 'Glitch',
    subtitle: 'Where am I? Who am I?',
    sound: 'Glitch.mp3',
    position: [1.6, 1.6, -10.6],
    target: [-0.4, 1.8, -14.3],
  },
  {
    title: 'Loneliness',
    subtitle: '',
    sound: 'Sorm.mp3',
    position: [5.2, 1.8, -17.7],
    target: [9.2, 2.4, -23.5],
  },
  {
    title: 'Thirst',
    subtitle: '',
    sound: 'Relax_music.mp3',
    position: [-1.0, 1.7, -19.2],
    target: [-6.3, 2.4, -24.5],
  },
  {
    title: 'Dances',
    subtitle: '',
    sound: 'Dance_music.mp3',
    position: [-4.2, 1.6, -12.9],
    target: [-9.8, 1.8, -13.0],
  },
  {
    title: 'Hahmo',
    subtitle: 'Go. Live. Feel. I’ll be here.',
    position: [-14.0, 1.6, -5.6],
    target: [-19.2, 1.5, -3.6],
  },
];
