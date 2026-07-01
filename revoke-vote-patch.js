import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

const revokeEndpoint = `
  // API Route - revoke-vote
  app.post("/api/revoke-vote", voteLimiter, async (req, res, next) => {
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
      
      const voteLogDocRef = db.doc(\`campaigns/\${campaignId}/votes/\${userId}\`);

      await db.runTransaction(async (transaction) => {
        const voteLogDoc = await transaction.get(voteLogDocRef);

        if (!voteLogDoc.exists) {
          throw new Error("You have not cast a vote in this campaign.");
        }

        const voteData = voteLogDoc.data();
        const candidateId = voteData.candidateId;
        const candidateDocRef = db.doc(\`campaigns/\${campaignId}/candidates/\${candidateId}\`);
        const campaignDocRef = db.doc(\`campaigns/\${campaignId}\`);
        
        const campaignDoc = await transaction.get(campaignDocRef);
        const candidateDoc = await transaction.get(candidateDocRef);

        if (campaignDoc.exists) {
          const currentTotalVotes = (campaignDoc.data()?.totalVotes || 0) - 1;
          transaction.update(campaignDocRef, { totalVotes: FieldValue.increment(-1) });
          
          const now = new Date();
          const dateStr = now.toISOString().split("T")[0];
          const candleRef = db.doc(\`campaigns/\${campaignId}/daily_candles/\${dateStr}\`);
          const candleSnap = await transaction.get(candleRef);
          
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
          }
        }

        if (candidateDoc.exists) {
          transaction.update(candidateDocRef, { voteCount: FieldValue.increment(-1) });
        }

        transaction.delete(voteLogDocRef);
      });

      return res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });
`;

content = content.replace('// API Route - create-campaign', revokeEndpoint + '\n  // API Route - create-campaign');
fs.writeFileSync('server.ts', content);
