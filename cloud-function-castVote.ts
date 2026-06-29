import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Node.js Callable Cloud Function to cast a vote with network velocity rate limiting.
 */
export const castVote = functions.https.onCall(async (data, context) => {
  // 1. Telemetry Extraction
  const ipAddress = context.rawRequest.ip || context.rawRequest.headers['x-forwarded-for'] || 'unknown';
  const targetId = data.targetId;

  if (!targetId) {
    throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a targetId.');
  }

  // Hash the IP address for privacy
  const ipHash = crypto.createHash('sha256').update(typeof ipAddress === 'string' ? ipAddress : ipAddress[0]).digest('hex');
  const now = admin.firestore.Timestamp.now();
  const twoMinutesAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 120 * 1000);

  // 2. Velocity Query
  // Query the transient Firestore collection using count() aggregation
  const velocityQuery = db.collection('vote_velocity_logs')
    .where('ipHash', '==', ipHash)
    .where('targetId', '==', targetId)
    .where('timestamp', '>=', twoMinutesAgo);

  const snapshot = await velocityQuery.count().get();
  const count = snapshot.data().count;

  // 3. Execution & Rejection
  if (count >= 10) {
    throw new functions.https.HttpsError(
      'resource-exhausted', 
      'Unnatural voting velocity detected.'
    );
  }

  // --- CORE VOTING TRANSACTION GOES HERE ---
  // e.g. await db.runTransaction(async (transaction) => { ... });
  // (Assuming core voting transaction succeeds)

  // 4. Transient Logging
  // Write a lightweight log with expiresAt for TTL purging
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 120 * 1000);

  await db.collection('vote_velocity_logs').add({
    ipHash,
    targetId,
    timestamp: now,
    expiresAt,
  });

  return { success: true };
});

/*
Infrastructure:
To configure a database-level TTL (Time-To-Live) policy on the expiresAt field so 
the system automatically purges stale logs without manual cron jobs, run the following Firebase CLI command:

firebase firestore:indexes

Or directly create the TTL policy via gcloud (since Firebase CLI uses the configuration file):

gcloud firestore field-ttl-policies update expiresAt \
    --collection-group=vote_velocity_logs \
    --enable-ttl \
    --async
*/
