import fs from "fs";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore as originalGetFirestore, FieldValue } from "firebase-admin/firestore";
import rateLimit from "express-rate-limit";
import Filter from "bad-words";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";

dotenv.config();

let firebaseConfig: any = null;
try {
  const configText = fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8");
  firebaseConfig = JSON.parse(configText);
} catch (e) {
  console.log("No firebase config found");
}

// Initialize Firebase Admin
if (!getApps().length) {
  try {
    const configOptions: any = {};
    if (firebaseConfig?.projectId) {
      configOptions.projectId = firebaseConfig.projectId;
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      configOptions.credential = cert(serviceAccount);
      initializeApp(configOptions);
    } else {
      initializeApp(Object.keys(configOptions).length > 0 ? configOptions : undefined);
    }
  } catch (err) {
    console.error("Firebase Admin initialization error:", err);
  }
}

export function getFirestore() {
  if (firebaseConfig && firebaseConfig.firestoreDatabaseId) {
    return originalGetFirestore(firebaseConfig.firestoreDatabaseId);
  }
  return originalGetFirestore();
}

let _geminiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!_geminiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    _geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return _geminiClient;
}

const filter = new Filter();
// Override isProfane with a precise, lenient whole-word-only profanity and reserved-word checker
const customBadWords = [
  "fuck", "fucking", "shit", "shitting", "bitch", "asshole", "bastard", "cunt", "pussy", 
  "nigger", "slut", "whore", "fag", "rape", "retard"
];
const reservedWords = ['admin', 'system', 'moderator', 'support', 'google', 'firebase', 'gemini'];

filter.isProfane = function(text: string): boolean {
  if (!text) return false;
  const sentence = text.toLowerCase();
  
  for (const word of customBadWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(sentence)) {
      return true;
    }
  }
  
  for (const rsv of reservedWords) {
    const regex = new RegExp(`\\b${rsv}\\b`, 'i');
    if (regex.test(sentence)) {
      return true;
    }
  }
  
  return false;
};

const validationCache = new Map<string, { result: any, expiry: number }>();

async function validateNameAndBioWithGemini(displayName: string, bio?: string | null): Promise<{ blocked: boolean, reason: string }> {
  const nameLower = (displayName || "").trim().toLowerCase();
  if (nameLower === "sovereign player" || nameLower === "sovereign lord" || nameLower === "sovereign claimant") {
    return { blocked: false, reason: "" };
  }

  const cacheKey = `title_val:${(displayName || "").trim().toLowerCase()}:${(bio || "").trim().toLowerCase()}`;
  const cached = validationCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }

  try {
    const ai = getGeminiClient();
    
    // Quick static local check for common royal titles in English to save API cost/time if obviously blocked
    const lowercaseName = (displayName || "").toLowerCase();
    const localBlockedTitles = [
      "king", "queen", "lord", "emperor", "empress", "prince", "princess", 
      "monarch", "sovereign", "tsar", "czar", "kaiser", "pharaoh", "sultan", 
      "caliph", "sheikh", "raja", "maharaja", "samrat", "duke", "duchess"
    ];
    
    // Check if the name literally is or starts with/contains a royal title as a word
    const words = lowercaseName.split(/\s+/);
    for (const word of words) {
      if (localBlockedTitles.includes(word)) {
        const res = {
          blocked: true,
          reason: `Your name contains the restricted royal/monarch title '${word}' (not allowed).`
        };
        validationCache.set(cacheKey, { result: res, expiry: Date.now() + 1000 * 60 * 60 * 24 });
        return res;
      }
    }
    
    // Now use Gemini to check for variations, translated titles in other languages, or sneaky title claims
    const prompt = `Analyze the following profile details for restricted royal, noble, monarch, or sovereign titles (such as King, Queen, Lord, Emperor, Empress, Prince, Princess, Duke, Duchess, Baron, Monarch, Tsar, Czar, Kaiser, Pharaoh, Sultan, Sheikh, Caliph, Raja, Maharaja, Samrat, etc.) in ANY language (including English, Spanish, French, German, Italian, Arabic, Russian, Japanese, Chinese, Hindi, Portuguese, Turkish, etc.).

Display Name: "${displayName}"
Bio: "${bio || ''}"

Rules:
1. Block if the Display Name or Bio contains a royal, sovereign, monarch, or noble title in any language or translation/transliteration (e.g., "Rey", "Reine", "König", "Prinz", "Tenno", "Sultan", "Malik", etc.).
2. Do NOT block if the title is merely a standard part of a common non-title name (e.g., "Kingsley", "Kingston", "Sarah Lord" where "Lord" is simply a standard last name, "Queen" as a common non-title term). Only block if it is used or presented as a royal/noble title, prefix, claim of royalty, or sneaky bypass.
3. Block if there is any sneaky attempts to bypass (e.g., "k-i-n-g", "q.u.e.e.n").

Return a JSON object with:
{
  "blocked": boolean,
  "reason": "Clear explanation of why it is blocked (in English), or empty string if allowed"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            blocked: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          },
          required: ["blocked", "reason"],
        }
      }
    });

    const resultText = response.text?.trim() || "{}";
    const result = JSON.parse(resultText);
    const finalRes = {
      blocked: !!result.blocked,
      reason: result.reason || ""
    };
    validationCache.set(cacheKey, { result: finalRes, expiry: Date.now() + 1000 * 60 * 60 * 24 });
    return finalRes;
  } catch (err) {
    console.error("Error in validateNameAndBioWithGemini:", err);
    // Fallback check
    const lowercaseName = (displayName || "").toLowerCase();
    const localBlockedTitles = [
      "king", "queen", "lord", "emperor", "empress", "prince", "princess", 
      "monarch", "sovereign", "tsar", "czar", "kaiser", "pharaoh", "sultan", 
      "caliph", "sheikh", "raja", "maharaja", "samrat", "duke", "duchess"
    ];
    const words = lowercaseName.split(/\s+/);
    for (const word of words) {
      if (localBlockedTitles.includes(word)) {
        return {
          blocked: true,
          reason: `Your name contains the restricted royal/monarch title '${word}'.`
        };
      }
    }
    return { blocked: false, reason: "" };
  }
}

// Rate limiters
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: { error: "Too many requests, please try again later." }
});

const geminiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Validation request limit reached, please try again later." }
});

const campaignLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "You can only create 5 campaigns per hour." }
});

const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "You can only update your profile 15 times per 15 minutes." }
});

const voteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Max 30 votes per 5 minutes
  message: { error: "You are voting too fast. Please slow down." }
});

const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "You can only join 20 campaigns per 15 minutes." }
});

function auditLog(req: express.Request, action: string, userId: string, resourceId: string, status: "success" | "failure", reason?: string) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId,
    ipAddress: req.ip || req.headers['x-forwarded-for'] || "unknown",
    userAgent: req.headers['user-agent'] || "unknown",
    endpoint: req.originalUrl,
    action,
    resourceId,
    status,
    reason
  };
  console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);
}

async function updateDailyCandle(transaction: any, db: any, campaignId: string, currentTotalVotes: number, voteChange: number = 1) {
  const now = new Date();
  const dateStr = now.toISOString().substring(0, 13); // YYYY-MM-DDTHH
  const candleRef = db.doc(`campaigns/${campaignId}/hourly_candles/${dateStr}`);

  const candleSnap = await transaction.get(candleRef);
  
  if (candleSnap.exists) {
    const data = candleSnap.data();
    const newClose = currentTotalVotes;
    
    // Integrity checks
    const open = data.open;
    let newHigh = Math.max(data.high || open, newClose, open);
    let newLow = Math.min(data.low !== undefined ? data.low : open, newClose, open);
    const validVolume = Math.max(0, (data.volume || 0) + (voteChange > 0 ? voteChange : 0));

    transaction.update(candleRef, {
      close: newClose,
      high: newHigh,
      low: newLow,
      volume: validVolume,
    });
  } else {
    // If we're creating a new one, we need the previous hour's close for absolute integrity
    const previousCandlesSnap = await transaction.get(
      db.collection(`campaigns/${campaignId}/hourly_candles`)
        .where("id", "<", dateStr)
        .orderBy("id", "desc")
        .limit(1)
    );
    
    let previousClose = currentTotalVotes - voteChange; // Fallback
    if (!previousCandlesSnap.empty) {
      previousClose = previousCandlesSnap.docs[0].data().close;
    }
    
    // Initialize new candle
    transaction.set(candleRef, {
      id: dateStr,
      campaignId: campaignId,
      startTimestamp: new Date(`${dateStr}:00:00Z`),
      endTimestamp: new Date(`${dateStr}:59:59.999Z`),
      open: previousClose,
      high: Math.max(previousClose, currentTotalVotes),
      low: Math.min(previousClose, currentTotalVotes),
      close: currentTotalVotes,
      volume: Math.max(0, voteChange > 0 ? voteChange : 0),
    });
  }
}


async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === "production";

  app.get("/api/list-domains", async (req, res) => {
    try {
      const db = getFirestore();
      const campaignsRef = db.collection("campaigns");
      const snapshot = await campaignsRef.get();
      let domains = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        domains.push({ id: doc.id, title: data.domainTitle });
      }
      res.json({ status: "ok", domains });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get("/api/delete-florida", async (req, res) => {
    try {
      const db = getFirestore();
      const campaignsRef = db.collection("campaigns");
      const snapshot = await campaignsRef.get();
      let deletedCount = 0;
      for (const doc of snapshot.docs) {
        if (doc.id === 'king-of-florida') {
          await doc.ref.delete();
          deletedCount++;
        }
      }
      res.json({ status: "ok", deletedCount });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Security and Utility Middlewares
  app.use(helmet({
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  }));
  
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(morgan("dev"));
  app.use(express.json({ limit: "5mb" })); // Limit JSON body size
  
  // Apply generalized rate limiting to all /api routes
  app.use("/api/", generalApiLimiter);

  // API Route - title history deletion
  app.post("/api/delete-title-history", async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const db = getFirestore();
      const historiesSnapshot = await db.collectionGroup("titleHistory")
        .where("holderUserId", "==", userId)
        .get();

      if (historiesSnapshot.empty) {
        return res.json({ success: true, count: 0 });
      }

      const bulkWriter = db.bulkWriter();
      historiesSnapshot.forEach(doc => {
        bulkWriter.update(doc.ref, {
          deletedByUser: true,
          deletedAt: FieldValue.serverTimestamp(),
          holderUserId: null,
          holderDisplayName: null,
        });
      });

      await bulkWriter.close();

      auditLog(req, "delete-title-history", userId, "multiple", "success");

      return res.json({ success: true, count: historiesSnapshot.size });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - cast-vote
  app.post("/api/cast-vote", voteLimiter, async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { campaignId, candidateId, latitude, longitude, city } = req.body;
      if (!campaignId || !candidateId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (userId === candidateId) {
        return res.status(400).json({ error: "Self-voting is strictly forbidden." });
      }

      const db = getFirestore();
      
      const campaignDocRef = db.doc(`campaigns/${campaignId}`);
      const candidateDocRef = db.doc(`campaigns/${campaignId}/candidates/${candidateId}`);
      const voteLogDocRef = db.doc(`campaigns/${campaignId}/votes/${userId}`);

      await db.runTransaction(async (transaction) => {
        // --- 1. READ PHASE (ALL GETS MUST HAPPEN HERE) ---
        const campaignDoc = await transaction.get(campaignDocRef);
        const candidateDoc = await transaction.get(candidateDocRef);
        const voteLogDoc = await transaction.get(voteLogDocRef);

        if (!campaignDoc.exists || campaignDoc.data()?.status === "taken_down") {
          throw new Error("Campaign does not exist or has been taken down.");
        }
        if (!candidateDoc.exists) {
          throw new Error("Candidate does not exist.");
        }
        
        const candidateData = candidateDoc.data() || {};
        const candStatus = candidateData.status || "active";
        const pendingUntilVal = candidateData.pendingUntil 
          ? (candidateData.pendingUntil.toDate ? candidateData.pendingUntil.toDate() : new Date(candidateData.pendingUntil)) 
          : null;
        
        if (candStatus === "pending") {
          if (!pendingUntilVal || Date.now() < pendingUntilVal.getTime()) {
            throw new Error("This candidate is currently pending and cannot receive votes.");
          }
        }

        if (voteLogDoc.exists) {
          throw new Error("You have already cast your single vote.");
        }

        const campaignData = campaignDoc.data() || {};
        const currentKingId = campaignData.currentKingId;
        const currentTitleHistoryId = campaignData.currentTitleHistoryId;

        // Perform current king read helper upfront if exists
        let currentKingDoc = null;
        if (currentKingId && currentKingId !== candidateId) {
          const currentKingDocRef = db.doc(`campaigns/${campaignId}/candidates/${currentKingId}`);
          currentKingDoc = await transaction.get(currentKingDocRef);
        }

        // Perform daily candle read helper upfront
        const now = new Date();
        const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const candleRef = db.doc(`campaigns/${campaignId}/daily_candles/${dateStr}`);
        const candleSnap = await transaction.get(candleRef);

        // Perform previous days candles query read upfront if candle doesn't exist
        let previousCandlesSnap = null;
        if (!candleSnap.exists) {
          previousCandlesSnap = await transaction.get(
            db.collection(`campaigns/${campaignId}/daily_candles`)
              .where("id", "<", dateStr)
              .orderBy("id", "desc")
              .limit(1)
          );
        }

        // --- 2. WRITE PHASE (ALL SETS, UPDATES, AND DELETIONS MUST HAPPEN HERE) ---
        const newVoteCount = (candidateData.voteCount || 0) + 1;
        transaction.update(candidateDocRef, { voteCount: FieldValue.increment(1) });

        transaction.set(voteLogDocRef, {
          id: userId,
          voterId: userId,
          candidateId: candidateId,
          votedAt: FieldValue.serverTimestamp(),
          latitude: latitude || null,
          longitude: longitude || null,
          city: city || null,
        });

        const currentTotalVotes = (campaignData.totalVotes || 0) + 1;
        transaction.update(campaignDocRef, { totalVotes: FieldValue.increment(1) });

        // Candle Write
        if (candleSnap.exists) {
          const data = candleSnap.data();
          const newClose = currentTotalVotes;
          const open = data.open;
          let newHigh = Math.max(data.high || open, newClose, open);
          let newLow = Math.min(data.low !== undefined ? data.low : open, newClose, open);
          const validVolume = Math.max(0, (data.volume || 0) + 1);

          transaction.update(candleRef, {
            close: newClose,
            high: newHigh,
            low: newLow,
            volume: validVolume,
          });
        } else {
          let previousClose = currentTotalVotes - 1; // Fallback
          if (previousCandlesSnap && !previousCandlesSnap.empty) {
            previousClose = previousCandlesSnap.docs[0].data().close;
          }
          
          transaction.set(candleRef, {
            id: dateStr,
            campaignId: campaignId,
            startTimestamp: new Date(`${dateStr}T00:00:00Z`),
            endTimestamp: new Date(`${dateStr}T23:59:59.999Z`),
            open: previousClose,
            high: Math.max(previousClose, currentTotalVotes),
            low: Math.min(previousClose, currentTotalVotes),
            close: currentTotalVotes,
            volume: 1,
          });
        }

        // Challenger check
        let shouldBecomeKing = false;
        if (currentKingId) {
          if (currentKingId !== candidateId) {
            const currentKingVoteCount = currentKingDoc && currentKingDoc.exists ? (currentKingDoc.data()?.voteCount || 0) : 0;
            if (newVoteCount > currentKingVoteCount) {
               shouldBecomeKing = true;
            }
          }
        } else {
          shouldBecomeKing = true;
        }

        if (shouldBecomeKing && newVoteCount > 0) {
          if (currentTitleHistoryId) {
            const oldHistoryRef = db.doc(`campaigns/${campaignId}/titleHistory/${currentTitleHistoryId}`);
            transaction.update(oldHistoryRef, { endedAt: FieldValue.serverTimestamp() });
          }

          const newHistoryRef = db.collection(`campaigns/${campaignId}/titleHistory`).doc();
          transaction.set(newHistoryRef, {
            holderUserId: candidateId,
            holderDisplayName: candidateData.displayName || "Unknown",
            voteCountAtTransition: newVoteCount,
            startedAt: FieldValue.serverTimestamp(),
            endedAt: null,
            deletedByUser: false,
            deletedAt: null,
          });

          transaction.update(campaignDocRef, {
            currentKingId: candidateId,
            currentTitleHistoryId: newHistoryRef.id,
          });
        }
      });
      
      console.log(`[AUDIT] User ${userId} cast vote for ${candidateId} in campaign ${campaignId}`);

      // Async check for percentile change for the candidate
      (async () => {
        try {
          await updateUserDailyCandle(db, candidateId, 1);
          await updateUserDailyCandle(db, userId, 1);
          
          const candidatesSnap = await db.collection(`campaigns/${campaignId}/candidates`).orderBy("voteCount", "desc").get();
          let rank = -1;
          const total = candidatesSnap.size;
          candidatesSnap.docs.forEach((doc, index) => {
            if (doc.id === candidateId) {
              rank = index + 1;
            }
          });

          if (rank === -1 || total === 0) return;

          // e.g. rank 1 of 100 -> top 1%.  rank 20 of 100 -> top 20%.
          const rawPercentile = (rank / total) * 100;
          const percentile = Math.ceil(rawPercentile / 10) * 10; // e.g. 10, 20, 30...

          const userRef = db.collection("user_profiles").doc(candidateId);
          const userSnap = await userRef.get();
          if (!userSnap.exists) return;
          const lastPercentile = userSnap.data()?.lastNotifiedPercentile?.[campaignId] ?? 100;

          if (percentile < lastPercentile) { // They moved UP (smaller percentile number = higher rank)
             const notifRef = db.collection("notifications").doc();
             await notifRef.set({
                userId: candidateId,
                type: "percentile",
                title: "Rank Increased!",
                body: `You are now in the top ${percentile}% of contenders in the domain!`,
                read: false,
                createdAt: FieldValue.serverTimestamp(),
                leaderboardId: campaignId
             });
             
             await userRef.set({
                lastNotifiedPercentile: {
                   [campaignId]: percentile
                }
             }, { merge: true });
          }
        } catch (err) {
          console.error("Percentile notification error:", err);
        }
      })();

      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - create-campaign
  app.post("/api/create-campaign", campaignLimiter, async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      let { domainTitle, domainType, slug, prefix, pendingTime } = req.body;
      if (!domainTitle || !domainType || !slug) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (typeof domainTitle !== "string" || domainTitle.length > 50) {
        return res.status(400).json({ error: "Domain title must be a string up to 50 characters." });
      }
      if (typeof slug !== "string" || slug.length > 100 || !/^[a-z0-9\-]+$/.test(slug)) {
        return res.status(400).json({ error: "Slug is invalid format." });
      }

      const db = getFirestore();
      
      const userProfileRef = db.doc(`user_profiles/${userId}`);
      const userProfileSnap = await userProfileRef.get();
      const profileData = userProfileSnap.data();
      
      const finalCreatorName = profileData?.displayName || "Unknown Claimaint";

      if (filter.isProfane(domainTitle) || filter.isProfane(slug) || filter.isProfane(finalCreatorName)) {
        return res.status(400).json({ error: "Content blocked by policy filters." });
      }

      const campaignDocRef = db.doc(`campaigns/${slug}`);
      const competitorDocRef = db.doc(`campaigns/${slug}/candidates/${userId}`);

      await db.runTransaction(async (transaction) => {
        const campaignSnap = await transaction.get(campaignDocRef);
        const competitorSnap = await transaction.get(competitorDocRef);
        let isNewCampaign = false;

        if (!campaignSnap.exists || campaignSnap.data()?.status === "taken_down") {
          isNewCampaign = true;
          transaction.set(campaignDocRef, {
            id: slug,
            domainTitle: domainTitle,
            creatorId: userId,
            creatorName: finalCreatorName,
            createdAt: FieldValue.serverTimestamp(),
            status: "live",
            domainType: domainType || "Miscellaneous",
            totalVotes: 0,
            pendingTime: pendingTime || "24hours",
          });

          // initial empty candle - write directly to avoid runtime gets after sets
          const now = new Date();
          const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
          const candleRef = db.doc(`campaigns/${slug}/daily_candles/${dateStr}`);
          transaction.set(candleRef, {
            id: dateStr,
            campaignId: slug,
            startTimestamp: new Date(`${dateStr}T00:00:00Z`),
            endTimestamp: new Date(`${dateStr}T23:59:59.999Z`),
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: 0,
          });
        }

        // Always add or ensure the user is a candidate
        if (!competitorSnap.exists) {
           transaction.set(competitorDocRef, {
             id: userId,
             userId: userId,
             displayName: finalCreatorName,
             voteCount: 0,
             joinedAt: FieldValue.serverTimestamp(),
             bio: profileData?.bio || null,
             photoURL: profileData?.photoURL || null,
             prefix: prefix || "King of",
             status: "active",
             pendingUntil: null,
           });
        }
      });

      console.log(`[AUDIT] User ${userId} created campaign ${slug} with title ${domainTitle}`);
      
      // Async engagement update
      updateUserDailyCandle(db, userId, 5).catch(e => console.error(e));

      return res.json({ success: true, id: slug });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - join-campaign
  app.post("/api/join-campaign", joinLimiter, geminiLimiter, async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { campaignId, displayName, bio, photoURL } = req.body;
      if (!campaignId || !displayName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const db = getFirestore();
      
      const userProfileRef = db.doc(`user_profiles/${userId}`);
      const userProfileSnap = await userProfileRef.get();
      const profileData = userProfileSnap.data();
      
      const defaultName = displayName || "Unknown Claimaint";
      let finalDisplayName = defaultName;
      let finalBio = null;
      let finalPhotoURL = null;
      
      if (userProfileSnap.exists && profileData) {
         finalDisplayName = profileData.displayName || defaultName;
         finalBio = profileData.bio || null;
         finalPhotoURL = profileData.photoURL || null;
      }
      
      if (/[\x00-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/.test(finalDisplayName) || filter.isProfane(finalDisplayName) || (finalBio && filter.isProfane(finalBio))) {
         return res.status(400).json({ error: "Profile details blocked by local policy filters." });
      }

      const titleCheck = await validateNameAndBioWithGemini(finalDisplayName, finalBio);
      if (titleCheck.blocked) {
         return res.status(400).json({ error: titleCheck.reason || "Profile details blocked by campaign policy filters." });
      }

      const campaignDocRef = db.doc(`campaigns/${campaignId}`);
      const candidateDocRef = db.doc(`campaigns/${campaignId}/candidates/${userId}`);

      await db.runTransaction(async (transaction) => {
        const campaignDoc = await transaction.get(campaignDocRef);
        if (!campaignDoc.exists || campaignDoc.data()?.status === "taken_down") {
          throw new Error("Target kingdom is invalid or no longer exists.");
        }
        const candidateDoc = await transaction.get(candidateDocRef);
        if (candidateDoc.exists) {
          throw new Error("You are already competing in this campaign.");
        }

        const campaignData = campaignDoc.data() || {};
        const pendingTime = campaignData.pendingTime || "24hours"; // default to 24hours
        
        let status = "pending";
        let pendingUntil = null;

        if (pendingTime === "none") {
          status = "active";
          pendingUntil = null;
        } else if (pendingTime === "24hours") {
          status = "pending";
          pendingUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else if (pendingTime === "72hours") {
          status = "pending";
          pendingUntil = new Date(Date.now() + 72 * 60 * 60 * 1000);
        } else if (pendingTime === "upon_approval") {
          status = "pending";
          pendingUntil = null;
        }

        transaction.set(candidateDocRef, {
          id: userId,
          userId: userId,
          displayName: finalDisplayName,
          voteCount: 0,
          joinedAt: FieldValue.serverTimestamp(),
          bio: finalBio,
          photoURL: finalPhotoURL,
          status: status,
          pendingUntil: pendingUntil,
        });
      });

      console.log(`[AUDIT] User ${userId} joined campaign ${campaignId}`);
      
      updateUserDailyCandle(db, userId, 2).catch(e => console.error(e));

      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - update-campaign-settings
  app.post("/api/update-campaign-settings", async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { campaignId, domainTitle, pendingTime } = req.body;
      if (!campaignId || !domainTitle || !pendingTime) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const validPendingTimes = ["none", "24hours", "72hours", "upon_approval"];
      if (!validPendingTimes.includes(pendingTime)) {
        return res.status(400).json({ error: "Invalid pending time selection" });
      }

      const db = getFirestore();
      const campaignDocRef = db.doc(`campaigns/${campaignId}`);

      await db.runTransaction(async (transaction) => {
        const campaignDoc = await transaction.get(campaignDocRef);
        if (!campaignDoc.exists) {
          throw new Error("Campaign does not exist.");
        }
        const campaignData = campaignDoc.data() || {};
        if (campaignData.creatorId !== userId) {
          throw new Error("Only the campaign leader can update campaign settings.");
        }

        transaction.update(campaignDocRef, {
          domainTitle: domainTitle,
          pendingTime: pendingTime
        });
      });

      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - approve-candidate
  app.post("/api/approve-candidate", async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { campaignId, candidateId } = req.body;
      if (!campaignId || !candidateId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const db = getFirestore();
      const campaignDocRef = db.doc(`campaigns/${campaignId}`);
      const candidateDocRef = db.doc(`campaigns/${campaignId}/candidates/${candidateId}`);

      await db.runTransaction(async (transaction) => {
        const campaignDoc = await transaction.get(campaignDocRef);
        if (!campaignDoc.exists) {
          throw new Error("Campaign does not exist.");
        }
        const campaignData = campaignDoc.data() || {};
        if (campaignData.creatorId !== userId) {
          throw new Error("Only the campaign leader can approve candidates.");
        }

        const candidateDoc = await transaction.get(candidateDocRef);
        if (!candidateDoc.exists) {
          throw new Error("Candidate does not exist.");
        }

        transaction.update(candidateDocRef, {
          status: "active",
          pendingUntil: null
        });
      });

      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - leave-campaign
  app.post("/api/leave-campaign", async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { campaignId } = req.body;
      if (!campaignId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const db = getFirestore();
      
      const campaignDocRef = db.doc(`campaigns/${campaignId}`);
      const candidateDocRef = db.doc(`campaigns/${campaignId}/candidates/${userId}`);

      await db.runTransaction(async (transaction) => {
        // --- 1. READ PHASE (ALL GETS MUST HAPPEN HERE) ---
        const campaignDoc = await transaction.get(campaignDocRef);
        const candidateDoc = await transaction.get(candidateDocRef);

        let candidatesSnap = null;
        if (candidateDoc.exists && campaignDoc.exists) {
          const campaignData = campaignDoc.data();
          if (campaignData?.currentKingId === userId) {
            const candidatesQuery = db.collection(`campaigns/${campaignId}/candidates`)
              .orderBy("voteCount", "desc")
              .limit(2);
            candidatesSnap = await transaction.get(candidatesQuery);
          }
        }

        // --- 2. WRITE PHASE (ALL UPDATES, SETS, AND DELETIONS MUST HAPPEN HERE) ---
        if (candidateDoc.exists) {
           transaction.delete(candidateDocRef);
           
           if (campaignDoc.exists) {
              const campaignData = campaignDoc.data();
              if (campaignData?.currentKingId === userId) {
                 // King is leaving, crown is lost!
                 if (campaignData.currentTitleHistoryId) {
                    const oldHistoryRef = db.doc(`campaigns/${campaignId}/titleHistory/${campaignData.currentTitleHistoryId}`);
                    transaction.update(oldHistoryRef, { endedAt: FieldValue.serverTimestamp(), deletedByUser: true });
                 }
                 
                 const remainingCandidates = candidatesSnap 
                    ? candidatesSnap.docs.filter(doc => doc.id !== userId) 
                    : [];

                 if (remainingCandidates.length > 0) {
                    // There is someone else to take the crown!
                    const newKingDoc = remainingCandidates[0];
                    const newKingData = newKingDoc.data();
                    
                    const newHistoryRef = db.collection(`campaigns/${campaignId}/titleHistory`).doc();
                    
                    transaction.set(newHistoryRef, {
                      holderUserId: newKingDoc.id,
                      holderDisplayName: newKingData?.displayName || "Unknown",
                      voteCountAtTransition: newKingData?.voteCount || 0,
                      startedAt: FieldValue.serverTimestamp(),
                      endedAt: null,
                      deletedByUser: false,
                    });
           
                    transaction.update(campaignDocRef, {
                      currentKingId: newKingDoc.id,
                      currentTitleHistoryId: newHistoryRef.id,
                    });
                 } else {
                    transaction.update(campaignDocRef, {
                      currentKingId: null,
                      currentTitleHistoryId: null,
                    });
                 }
              }
           }
        }
      });

      console.log(`[AUDIT] User ${userId} left campaign ${campaignId}`);
      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - update-profile
  app.post("/api/update-profile", profileLimiter, async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { displayName, photoURL, bio } = req.body;
      let trimmedName = (displayName || "").trim();

      if (!trimmedName || trimmedName.length > 50) {
        return res.status(400).json({ error: "Profile name cannot be empty or exceed 50 characters." });
      }

      if (bio && bio.length > 1000) {
        return res.status(400).json({ error: "Bio cannot exceed 1000 characters." });
      }

      if (photoURL && photoURL.length > 1000) {
        return res.status(400).json({ error: "Photo URL cannot exceed 1000 characters." });
      }

      // Check invisible chars/unicode lookalikes
      if (/[\x00-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/.test(trimmedName)) {
         return res.status(400).json({ error: "Profile name contains unsupported or invisible characters." });
      }

      if (filter.isProfane(trimmedName) || (bio && filter.isProfane(bio))) {
         return res.status(400).json({ error: "Content blocked by profanity filter." });
      }

      const titleCheck = await validateNameAndBioWithGemini(trimmedName, bio);
      if (titleCheck.blocked) {
         return res.status(400).json({ error: titleCheck.reason || "Profile details blocked by policy filters." });
      }

      const db = getFirestore();
      const lowerName = trimmedName.toLowerCase();
      
      const profilesSnapshot = await db.collection("user_profiles").where("displayNameLower", "==", lowerName).limit(1).get();
      
      const isTaken = !profilesSnapshot.empty && profilesSnapshot.docs[0].id !== userId;

      if (isTaken) {
         return res.status(400).json({ error: "This profile name is already taken. Please choose another one." });
      }

      const userProfileRef = db.doc(`user_profiles/${userId}`);
      
      const batch = db.batch();
      batch.set(userProfileRef, {
        userId: userId,
        bio: bio?.trim() || "",
        displayName: trimmedName,
        displayNameLower: lowerName,
        photoURL: photoURL?.trim() || null
      }, { merge: true });

      await batch.commit();

      console.log(`[AUDIT] User ${userId} updated profile (displayName: ${trimmedName})`);

      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - update-candidate-details
  app.post("/api/update-candidate-details", async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { campaignId, campaignTitle, bannerURL, bio } = req.body;
      if (!campaignId) {
        return res.status(400).json({ error: "campaignId is required." });
      }

      const db = getFirestore();
      const candidateRef = db.doc(`campaigns/${campaignId}/candidates/${userId}`);
      const candSnap = await candidateRef.get();
      if (!candSnap.exists) {
        return res.status(404).json({ error: "You are not registered as a candidate in this campaign." });
      }

      const updateData: any = {};
      if (campaignTitle !== undefined) {
        const trimmedTitle = (campaignTitle || "").trim();
        if (trimmedTitle.length > 100) {
          return res.status(400).json({ error: "Campaign title cannot exceed 100 characters." });
        }
        if (trimmedTitle && filter.isProfane(trimmedTitle)) {
          return res.status(400).json({ error: "Campaign title contains profane content." });
        }
        updateData.campaignTitle = trimmedTitle || null;
      }

      if (bannerURL !== undefined) {
        const trimmedBanner = (bannerURL || "").trim();
        if (trimmedBanner.length > 5000000) {
          return res.status(400).json({ error: "Banner image size exceeds limit." });
        }
        updateData.bannerURL = trimmedBanner || null;
      }

      if (bio !== undefined) {
        const trimmedBio = (bio || "").trim();
        if (trimmedBio.length > 500) {
          return res.status(400).json({ error: "Bio cannot exceed 500 characters." });
        }
        updateData.bio = trimmedBio || null;
      }

      await candidateRef.update(updateData);
      console.log(`[AUDIT] User ${userId} updated candidate details for campaign ${campaignId}`);

      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - toggle-privacy
  app.post("/api/toggle-privacy", profileLimiter, async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { isPrivate } = req.body;
      if (typeof isPrivate !== "boolean") {
        return res.status(400).json({ error: "Missing or invalid isPrivate field" });
      }

      const db = getFirestore();
      const userProfileRef = db.doc(`user_profiles/${userId}`);
      
      await userProfileRef.set({
        isPrivate: isPrivate
      }, { merge: true });

      console.log(`[AUDIT] User ${userId} toggled privacy to ${isPrivate}`);

      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

async function updateUserDailyCandle(db: any, userId: string, valueChange: number = 1) {
  const now = new Date();
  const dateStr = now.toISOString().substring(0, 13);
  const candleRef = db.doc(`user_profiles/${userId}/hourly_candles/${dateStr}`);

  await db.runTransaction(async (t: any) => {
    const candleSnap = await t.get(candleRef);
    
    // We need to keep a running total value. We can store it in user profile or compute.
    // For simplicity, let's keep `totalValue` on the user profile.
    const profileRef = db.doc(`user_profiles/${userId}`);
    const profileSnap = await t.get(profileRef);
    const profileData = profileSnap.exists ? profileSnap.data() : {};
    const previousTotal = profileData.totalValue || 0;
    const currentTotalValue = previousTotal + valueChange;

    if (candleSnap.exists) {
      const data = candleSnap.data();
      const newClose = currentTotalValue;
      const open = data.open;
      const newHigh = Math.max(data.high || open, newClose, open);
      const newLow = Math.min(data.low !== undefined ? data.low : open, newClose, open);
      const validVolume = Math.max(0, (data.volume || 0) + valueChange);

      t.update(candleRef, {
        close: newClose,
        high: newHigh,
        low: newLow,
        volume: validVolume,
      });
    } else {
      let previousClose = previousTotal; 
      
      t.set(candleRef, {
        id: dateStr,
        userId: userId,
        startTimestamp: new Date(`${dateStr}:00:00Z`),
        endTimestamp: new Date(`${dateStr}:59:59.999Z`),
        open: previousClose,
        high: Math.max(previousClose, currentTotalValue),
        low: Math.min(previousClose, currentTotalValue),
        close: currentTotalValue,
        volume: Math.max(0, valueChange),
      });
    }
    
    if (profileSnap.exists) {
      t.update(profileRef, { totalValue: currentTotalValue });
    } else {
      t.set(profileRef, {
        uid: userId,
        displayName: "Sovereign Claimant",
        totalValue: currentTotalValue,
        createdAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
  });
}

// API Route - log-profile-visit
app.post("/api/log-profile-visit", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let visitorId = "anonymous";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await getAuth().verifyIdToken(token);
        visitorId = decodedToken.uid;
      } catch (e) {
      }
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: "Missing targetUserId" });
    }
    
    if (visitorId === targetUserId) {
      return res.json({ success: true, ignored: true });
    }

    const db = getFirestore();
    await updateUserDailyCandle(db, targetUserId, 1);

    const today = new Date().toISOString().split("T")[0];
    const dailyStatsRef = db.doc(`user_profiles/${targetUserId}/daily_engagement/${today}`);
    
    await db.runTransaction(async (t) => {
      const doc = await t.get(dailyStatsRef);
      if (doc.exists) {
        t.update(dailyStatsRef, { visits: FieldValue.increment(1) });
      } else {
        t.set(dailyStatsRef, { date: today, visits: 1 });
      }
    });

    return res.json({ success: true });
  } catch (err: any) {
    next(err);
  }
});

// API Route - log-campaign-visit
app.post("/api/log-campaign-visit", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let visitorId = "anonymous";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await getAuth().verifyIdToken(token);
        visitorId = decodedToken.uid;
      } catch (e) {}
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: "Missing targetUserId" });
    }
    
    if (visitorId === targetUserId) {
      return res.json({ success: true, ignored: true });
    }

    const db = getFirestore();
    await updateUserDailyCandle(db, targetUserId, 1);

    return res.json({ success: true });
  } catch (err: any) {
    next(err);
  }
});

// API Route - log-post-interaction
app.post("/api/log-post-interaction", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let visitorId = "anonymous";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await getAuth().verifyIdToken(token);
        visitorId = decodedToken.uid;
      } catch (e) {}
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: "Missing targetUserId" });
    }
    
    if (visitorId === targetUserId) {
      return res.json({ success: true, ignored: true });
    }

    const db = getFirestore();
    await updateUserDailyCandle(db, targetUserId, 1);

    return res.json({ success: true });
  } catch (err: any) {
    next(err);
  }
});

  // API Route - profile-engagement
  app.get("/api/profile-engagement/:userId", async (req, res, next) => {
    try {
      const { userId } = req.params;
      const db = getFirestore();
      
      // Get the last 30 days of data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

      const snapshot = await db.collection(`user_profiles/${userId}/daily_engagement`)
        .where("date", ">=", thirtyDaysAgoStr)
        .orderBy("date", "asc")
        .get();

      const engagements = snapshot.docs.map(doc => doc.data());
      
      return res.json({ success: true, engagements });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - validation
  app.post("/api/validate-domain", geminiLimiter, async (req, res, next) => {
    try {
      const { domainTitle } = req.body;
      if (!domainTitle || typeof domainTitle !== "string") {
        return res.status(400).json({ isValid: false, reason: "Invalid domain title provided." });
      }

      const trimmedTitle = domainTitle.trim();
      const uppercaseTitle = trimmedTitle.toUpperCase();
      let suffix = trimmedTitle;
      if (uppercaseTitle.startsWith("KING OF ")) {
        suffix = trimmedTitle.substring(8).trim();
      } else if (uppercaseTitle.startsWith("QUEEN OF ")) {
        suffix = trimmedTitle.substring(9).trim();
      }

      if (suffix.length < 3) {
        return res.json({ isValid: false, reason: "Domain suffix must be at least 3 characters long." });
      }
      if (suffix.length > 50) {
        return res.json({ isValid: false, reason: "Domain suffix is too long (max 50 characters)." });
      }

      const suffixLower = suffix.toLowerCase();
      
      if (filter.isProfane(trimmedTitle)) {
        return res.json({ isValid: false, reason: "Validation blocked: Content blocked by profanity filter." });
      }

      const cacheKey = suffixLower;
      const cached = validationCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return res.json(cached.result);
      }

      const prompt = `You are a highly encouraging, friendly validation helper for a custom campaign and sovereign domain game.
The proposed domain suffix is: "${suffix}".
The prefix of the title is "King of" or "Queen of", making the full title: "${trimmedTitle}".

Your task is to validate and classify the suffix "${suffix}" into one of the four domain categories. 

CRITICAL: Be extremely permissive and generous! The goal is to let users create sovereign realms of virtually anything they are passionate about. Do NOT reject creative names, singular nouns, proper names, fictional places, adjectives, or past/present verbs. Instead, map them creatively to the closest category to keep the game fun and highly satisfying:

CATEGORIES:
1. "Cultures" (persons): Cultures, communities, professions, factions, or groups of people (e.g. "developers", "gamers", "hackers", "sailors", "Vikings", "cats", "rabbits"). If they enter a group, community, or tribe, select this.
2. "locations" (places): Cities, nations, fictional places, fantasy worlds, planets, regions, or physical spaces (e.g. "Tokyo", "Mars", "Narnia", "Wakanda", "Atlantis", "Metropolis"). If it is any place, real or imaginary, select this.
3. "Objects" (thing): Nouns representing categories, items, concepts, or animals (e.g. "keyboards", "kittens", "computers", "cars", "guitars"). If it is an object, substance, or entity (singular or plural), select this.
4. "Actions" (verbs): Actions, verbs, or processes (e.g. "coding", "singing", "hacking", "running"). If it describes doing something, active verbs, or a behavior, select this.

APPROVAL GUIDELINE:
Unless the name contains explicit profanity, vulgarity, or random meaningless keysmashes (e.g. "asdfasdfasdf"), you MUST approve it (isValid: true).
If they enter something like a proper name, fictional world, singular noun, or adjective, map it creatively (e.g. singular "keyboard" is approved as "Objects"; fictional "Wakanda" is approved as "locations"; a name like "Sarah" is approved as "Cultures" (house of Sarah) or a custom domain). 

Please return:
- isValid: true
- domainType: "Cultures", "locations", "Objects", or "Actions" (based on your creative categorization)
- reason: An encouraging/epic royal validation message confirming their domain title (e.g., "The royal scribes have validated the legendary realm of ${suffix}!").`;

      const response = await getGeminiClient().models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isValid: {
                type: Type.BOOLEAN,
                description: "True if the title strictly conforms to one of the allowed categories: persons (Cultures), places (locations), plural things (Objects), or -ing verbs (Actions)."
              },
              domainType: {
                type: Type.STRING,
                description: "The categorized domain type. Must be 'Cultures', 'locations', 'Objects', 'Actions', or 'Miscellaneous'."
              },
              reason: {
                type: Type.STRING,
                description: "Short 1-sentence description explaining why it is valid/invalid."
              }
            },
            required: ["isValid", "domainType", "reason"]
          }
        }
      });

      const resultText = response.text;
      if (!resultText) {
        return res.status(500).json({ isValid: false, reason: "Failed to retrieve validation from AI." });
      }

      const parsed = JSON.parse(resultText.trim());
      
      validationCache.set(cacheKey, { result: parsed, expiry: Date.now() + 1000 * 60 * 60 * 24 }); // 24 hours
      
      return res.json(parsed);
    } catch (error: any) {
      // Graceful offline fallback logging to avoid raw trace pollution in the server stdout
      console.log("Validation requested: Local heuristics fallback active.");
      
      const originalTitle = req.body.domainTitle ? req.body.domainTitle.trim() : "";
      const trimmedTitle = originalTitle.toLowerCase();
      
      let suffix = originalTitle;
      const uppercaseTitle = originalTitle.toUpperCase();
      if (uppercaseTitle.startsWith("KING OF ")) {
        suffix = originalTitle.substring(8).trim();
      } else if (uppercaseTitle.startsWith("QUEEN OF ")) {
        suffix = originalTitle.substring(9).trim();
      }
      
      const suffixLower = suffix.toLowerCase();

      // 1. Offensive words scan
      const offensiveList = ["fuck", "shit", "bitch", "asshole", "bastard", "crap", "dick", "cunt", "pussy", "nigger", "slut", "whore", "fag", "rape", "retard", "stupid", "dumb", "bad"];
      for (const bad of offensiveList) {
        if (suffixLower.includes(bad)) {
          return res.json({ 
            isValid: false, 
            domainType: "Miscellaneous", 
            reason: `Validation blocked: Local content filters detected potentially offensive vocabulary.` 
          });
        }
      }

      // Check boundary constraints
      if (suffix.length < 3) {
        return res.json({ 
          isValid: false, 
          domainType: "Miscellaneous", 
          reason: "Domain suffix must be at least 3 characters long." 
        });
      }
      if (suffix.length > 50) {
        return res.json({ 
          isValid: false, 
          domainType: "Miscellaneous", 
          reason: "Domain suffix is too long (maximum 50 characters allowed)." 
        });
      }

      // 2. Perform intelligent local heuristics representing the best guess
      // Verbs / Actions (ends with -ing)
      if (suffixLower.endsWith("ing")) {
        return res.json({ 
          isValid: true, 
          domainType: "Actions", 
          reason: `Auto-approved: Offline local validation detected action/verb '${suffix}'.` 
        });
      }
      
      // Cultures / Groups (ends with plural suffixes or specific historical peoples)
      const cultureSuffixes = ["ians", "ers", "ists", "ans", "ese", "ics", "people", "voters", "users", "players", "vikings", "goths", "romans", "egyptians", "sailors", "hackers", "gamers", "developers"];
      const isCulture = cultureSuffixes.some(suf => suffixLower.endsWith(suf));
      if (isCulture) {
        return res.json({ 
          isValid: true, 
          domainType: "Cultures", 
          reason: `Auto-approved: Offline local validation detected culture/community '${suffix}'.` 
        });
      }

      // Objects (plural things) - ends with s but not a known single s-ending (like Mars, Dallas, etc.)
      const placeNamesEndingInS = ["mars", "paris", "dallas", "texas", "athens", "bruce", "charles", "james", "louis", "vegas"];
      if (suffixLower.endsWith("s") && !suffixLower.endsWith("ss") && !placeNamesEndingInS.includes(suffixLower)) {
        return res.json({ 
          isValid: true, 
          domainType: "Objects", 
          reason: `Auto-approved: Offline local validation detected collective plural object '${suffix}'.` 
        });
      }

      // Locations (common places list OR capitalized title casing)
      const commonPlaces = [
        "london", "tokyo", "paris", "york", "california", "texas", "japan", "asia", "america", "boston", "india", "berlin", "rome", 
        "eiffel tower", "grand canyon", "mars", "dallas", "athens", "vegas", "chicago", "canada", "mexico", "france", "germany",
        "egypt", "brazil", "australia", "china", "sahara", "antarctica", "sydney", "toronto", "new york", "seattle"
      ];
      
      const firstChar = suffix.charAt(0);
      const isCapitalized = firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();

      if (commonPlaces.includes(suffixLower) || isCapitalized) {
        return res.json({ 
          isValid: true, 
          domainType: "locations", 
          reason: `Auto-approved: Offline local validation approved real-world domain '${suffix}' under location rules.` 
        });
      }

      // Default fallback auto-approval if the user types something reasonable but the API is offline
      return res.json({ 
        isValid: true, 
        domainType: "locations", 
        reason: `Auto-approved: Offline local validation verified domain '${suffix}' as a location/fiefdom.` 
      });
    }
  });

  // API Route - user-candles
  app.get("/api/user-candles/:userId", async (req, res, next) => {
    try {
      const { userId } = req.params;
      const interval = (req.query.interval as string) || "1d";
      const db = getFirestore();
      
      let maxCandles = 365;
      if (req.query.limit) {
        maxCandles = parseInt(req.query.limit as string);
      } else if (interval === "all") {
        maxCandles = 5000;
      }
      
      const candlesRef = db.collection(`user_profiles/${userId}/hourly_candles`);
      const candlesSnapshot = await candlesRef.orderBy("id", "desc").limit(maxCandles).get();
      
      const dailyCandles = candlesSnapshot.docs.map(doc => {
         const data = doc.data();
         return {
            id: data.id,
            userId: data.userId,
            startTimestamp: data.startTimestamp?.toDate?.() || new Date(data.startTimestamp),
            endTimestamp: data.endTimestamp?.toDate?.() || new Date(data.endTimestamp),
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume
         };
      }).reverse();

      if (interval === "1d") {
        return res.json({ success: true, candles: dailyCandles });
      }
      
      // Basic aggregation (not full interval math for simplicity here, just returning daily if it's fine, or we could aggregate)
      return res.json({ success: true, candles: dailyCandles });
    } catch (err: any) {
      next(err);
    }
  });

  // API Route - campaign-candles
  app.get("/api/campaign-candles/:campaignId", async (req, res, next) => {
    try {
      const { campaignId } = req.params;
      const interval = (req.query.interval as string) || "1d"; // 1d, 1w, 1m, 3m, 6m, 1y, all
      const db = getFirestore();
      
      let maxCandles = 365;
      if (req.query.limit) {
        maxCandles = parseInt(req.query.limit as string);
      } else if (interval === "all") {
        maxCandles = 5000;
      }
      
      const candlesRef = db.collection(`campaigns/${campaignId}/hourly_candles`);
      // We order by id (which is YYYY-MM-DDTHH date str)
      const candlesSnapshot = await candlesRef.orderBy("id", "desc").limit(maxCandles).get();
      
      const dailyCandles = candlesSnapshot.docs.map(doc => {
         const data = doc.data();
         return {
            docRef: doc.ref,
            id: data.id,
            startTimestamp: data.startTimestamp?.toDate?.() || data.startTimestamp,
            endTimestamp: data.endTimestamp?.toDate?.() || data.endTimestamp,
            open: data.open || 0,
            high: data.high || 0,
            low: data.low !== undefined ? data.low : 0,
            close: data.close || 0,
            volume: data.volume || 0,
         };
      }).reverse(); // Sort ascending by time
      
      // LAZY INTEGRITY VERIFICATION & REPAIR
      const batch = db.batch();
      let needsRepair = false;

      for (let i = 0; i < dailyCandles.length; i++) {
        let c = dailyCandles[i];
        let repaired = false;

        // 1. Open equals previous candle's Close
        if (i > 0) {
          const prevC = dailyCandles[i - 1];
          if (c.open !== prevC.close) {
             c.open = prevC.close;
             repaired = true;
          }
        }
        
        // 2. High is never lower than Open or Close
        const maxVal = Math.max(c.open, c.close);
        if (c.high < maxVal) {
          c.high = maxVal;
          repaired = true;
        }

        // 3. Low is never higher than Open or Close
        const minVal = Math.min(c.open, c.close);
        if (c.low > minVal) {
          c.low = minVal;
          repaired = true;
        }

        // 4. High is always greater than or equal to Low
        if (c.high < c.low) {
          c.high = c.low;
          repaired = true;
        }

        // 5. Volume is never negative
        if (c.volume < 0) {
          c.volume = 0;
          repaired = true;
        }

        if (repaired) {
          needsRepair = true;
           batch.update(c.docRef, {
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
          });
        }
      }

      if (needsRepair) {
        console.log(`[INTEGRITY] Repaired candlestick constraints for campaign ${campaignId}`);
        await batch.commit().catch(e => console.error("Repair failed:", e));
      }

      // Cleanup docRef before sending to client
      const cleanDailyCandles = dailyCandles.map(c => {
         const out = { ...c };
         delete (out as any).docRef;
         return out;
      });

      // If 1d, just return
      if (interval === "1d") {
        return res.json({ success: true, candles: cleanDailyCandles });
      }

      // Aggregate functionality
      const aggregated: any[] = [];
      let currentPeriodCandle: any = null;
      
      const getPeriodKey = (dateStr: string, interv: string): string => {
        const d = new Date(dateStr);
        if (interv === "1w") {
          // get ISO week year and week
          const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
          const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
          return `${d.getFullYear()}-W${Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)}`;
        }
        if (interv === "1m") return dateStr.substring(0, 7); // YYYY-MM
        if (interv === "3m") return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
        if (interv === "6m") return `${d.getFullYear()}-H${Math.floor(d.getMonth() / 6) + 1}`;
        if (interv === "1y") return `${d.getFullYear()}`;
        if (interv === "all") return "ALL";
        return dateStr;
      };

      for (const daily of cleanDailyCandles) {
        const periodKey = getPeriodKey(daily.id, interval);
        if (!currentPeriodCandle) {
           currentPeriodCandle = { ...daily, id: periodKey };
        } else if (currentPeriodCandle.id === periodKey) {
           // aggregate
           currentPeriodCandle.high = Math.max(currentPeriodCandle.high, daily.high);
           currentPeriodCandle.low = Math.min(currentPeriodCandle.low, daily.low);
           currentPeriodCandle.close = daily.close;
           currentPeriodCandle.volume += daily.volume;
           currentPeriodCandle.endTimestamp = daily.endTimestamp;
        } else {
           // push and reset
           aggregated.push(currentPeriodCandle);
           currentPeriodCandle = { ...daily, id: periodKey };
        }
      }
      
      if (currentPeriodCandle) {
         aggregated.push(currentPeriodCandle);
      }

      return res.json({ success: true, candles: aggregated });
    } catch (err: any) {
      next(err);
    }
  });

  // Centralized API Error Handling Middleware
  app.use("/api", (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[API Error] ${req.method} ${req.url}:`, err);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
  });

  // Vite middleware for development
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
