export type Topic = {
  id: string;
  label: string;
  emoji: string;
};

export type MatchConfig = {
  players: [string, string];
  topic: Topic;
  seconds: number;
  camerasEnabled: boolean;
};
