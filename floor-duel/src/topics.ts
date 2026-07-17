import { Topic } from './types';

export const TOPICS: Topic[] = [
  { id: 'fruits', label: 'Fruits', emoji: '🍉' },
  { id: 'countries', label: 'Countries', emoji: '🌍' },
  { id: 'capitals', label: 'Capital Cities', emoji: '🏛️' },
  { id: 'animals', label: 'Animals', emoji: '🦁' },
  { id: 'dog-breeds', label: 'Dog Breeds', emoji: '🐕' },
  { id: 'movies', label: 'Movies', emoji: '🎬' },
  { id: 'actors', label: 'Actors', emoji: '🎭' },
  { id: 'football-clubs', label: 'Football Clubs', emoji: '⚽' },
  { id: 'nba-players', label: 'NBA Players', emoji: '🏀' },
  { id: 'rappers', label: 'Rappers', emoji: '🎤' },
  { id: 'pop-songs', label: 'Pop Songs', emoji: '🎵' },
  { id: 'tv-shows', label: 'TV Shows', emoji: '📺' },
  { id: 'superheroes', label: 'Superheroes', emoji: '🦸' },
  { id: 'car-brands', label: 'Car Brands', emoji: '🚗' },
  { id: 'pizza-toppings', label: 'Pizza Toppings', emoji: '🍕' },
  { id: 'vegetables', label: 'Vegetables', emoji: '🥦' },
  { id: 'sports', label: 'Sports', emoji: '🏅' },
  { id: 'board-games', label: 'Board Games', emoji: '🎲' },
  { id: 'video-games', label: 'Video Games', emoji: '🎮' },
  { id: 'fast-food', label: 'Fast Food Chains', emoji: '🍔' },
  { id: 'kitchen-things', label: 'Things in a Kitchen', emoji: '🍳' },
  { id: 'clothing-brands', label: 'Clothing Brands', emoji: '👟' },
  { id: 'desserts', label: 'Desserts', emoji: '🍰' },
  { id: 'ocean-life', label: 'Ocean Life', emoji: '🐙' },
];

export function randomTopic(): Topic {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}
