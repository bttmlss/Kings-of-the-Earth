export interface CourtPreset {
  id: string;
  name: string;
  members: CourtMember[];
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  courtPresets?: CourtPreset[];
}

export interface Campaign {
  id: string; // e.g., slug derived from domainTitle
  domainTitle: string; // e.g. "king of cats"
  creatorId: string;
  creatorName: string;
  createdAt: any; // Firestore Timestamp
  status: "live" | "taken_down";
  domainType?: "Cultures" | "locations" | "Objects" | "Actions" | "Miscellaneous";
  isFrozen?: boolean;
  currentKingId?: string | null;
  totalVotes?: number;
  pendingTime?: "none" | "24hours" | "72hours" | "upon_approval";
}

export interface Candidate {
  id: string; // Document ID (the candidate's userId)
  userId: string;
  displayName: string;
  voteCount: number;
  joinedAt: any; // Firestore Timestamp
  photoURL?: string | null;
  bio?: string;
  prefix?: string;
  campaignTitle?: string;
  bannerURL?: string;
  status?: "pending" | "approved" | "active";
  pendingUntil?: any; // Firestore Timestamp or null
}

export interface VoteLog {
  id: string; // voterId + "_" + candidateId
  voterId: string;
  candidateId: string;
  votedAt: any; // Firestore Timestamp
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
}

export interface VotingCandle {
  id?: string; // string "YYYY-MM-DD"
  campaignId?: string;
  startTimestamp: any; // Firestore Timestamp
  endTimestamp: any; // Firestore Timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // votes gained
}

export interface CourtMember {
  id: string;
  parentId: string | null;
  displayName: string;
  title: string;
  isAppUser: boolean;
  userId: string | null;
  photoURL?: string | null;
}

export interface Court {
  userId: string;
  campaignId: string;
  members: CourtMember[];
  updatedAt: any;
}

