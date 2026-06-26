import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({ projectId: "ai-studio-6d3061a8-40d1-400a-84f9-02a757575a69" });
const db = getFirestore(app);

async function run() {
  const snapshot = await db.collection('campaigns').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.domainTitle && data.domainTitle.toLowerCase().includes('florida')) {
      console.log('Deleting:', doc.id, data.domainTitle);
      await db.collection('campaigns').doc(doc.id).delete();
    }
  }
}
run().catch(console.error);
