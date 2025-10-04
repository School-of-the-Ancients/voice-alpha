
export interface Ambience {
  tag: string;
  description: string;
  audioSrc: string;
}

export interface Character {
  id: string;
  name: string;
  title: string;
  portraitUrl: string;
  bio: string;
  greeting: string;
  systemInstruction: string;
  voiceName: string;
  voiceAccent: string;
  timeframe: string;
  expertise: string;
  passion: string;
  suggestedPrompts: string[];
  ambienceTag: string;
}

export interface PersonaData {
  title: string;
  bio: string;
  greeting: string;
  timeframe: string;
  expertise: string;
  passion: string;
  systemInstruction: string;
  suggestedPrompts: string[];
  voiceName: string;
  ambienceTag: string;
  voiceAccent: string;
}

export enum ConnectionState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR',
  DISCONNECTED = 'DISCONNECTED',
}

export interface ConversationTurn {
  speaker: 'user' | 'model';
  speakerName: string;
  text: string;
  artifact?: {
    id: string;
    name: string;
    imageUrl: string;
    loading?: boolean;
  };
}

export interface Summary {
  overview: string;
  takeaways: string[];
}

export interface QuestAssessment {
  questId: string;
  questTitle: string;
  passed: boolean;
  summary: string;
  evidence: string[];
  improvements: string[];
}

export interface SavedConversation {
  id: string;
  characterId: string;
  characterName: string;
  portraitUrl: string;
  timestamp: number;
  transcript: ConversationTurn[];
  environmentImageUrl?: string;
  summary?: Summary;
  questId?: string;
  questTitle?: string;
  questAssessment?: QuestAssessment;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  objective: string;
  characterId: string;
  duration: string;
  focusPoints: string[];
}

export type QuestStatus = 'not_started' | 'in_progress' | 'completed';

export type MasteryLevel = 'novice' | 'apprentice' | 'adept' | 'master';

export interface QuestProgressRecord {
  questId: string;
  questTitle: string;
  characterId: string;
  objective: string;
  objectiveKey: string;
  status: QuestStatus;
  lastUpdated: number;
  lastAssessment?: QuestAssessment;
  nextSteps: string[];
}

export interface SubjectProgressRecord {
  subjectId: string;
  subjectName: string;
  totalQuests: number;
  completedQuests: number;
  masteryLevel: MasteryLevel;
  lastUpdated: number;
  nextSteps: string[];
  recentQuestTitle?: string;
}

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  earnedAt: number;
  questId?: string;
  subjectId?: string;
}

export interface StudentProgressSnapshot {
  quests: Record<string, QuestProgressRecord>;
  subjects: Record<string, SubjectProgressRecord>;
  achievements: AchievementBadge[];
}
