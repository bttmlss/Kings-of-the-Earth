const healedMembers = [
  { id: "123", parentId: null, displayName: "Initiate", userId: "other" }
];
const userId = "leader123";
let needsHealing = false;

const hasLeader = healedMembers.some(m => m.userId === userId);
const rootIndex = healedMembers.findIndex(m => m.id === "root");

if (!hasLeader || rootIndex === -1) {
  needsHealing = true;
  const properRoot = { id: "root", parentId: null, userId: userId, displayName: "Leader" };
  
  if (rootIndex !== -1 && healedMembers[rootIndex].userId !== userId) {
    healedMembers[rootIndex].id = "newId";
    healedMembers[rootIndex].parentId = "root";
  }
  
  healedMembers.forEach(m => {
    if (m.parentId === null && m.id !== "root") {
      m.parentId = "root";
    }
  });

  if (!healedMembers.some(m => m.id === "root")) {
      healedMembers.push(properRoot);
  }
}
console.log(JSON.stringify(healedMembers, null, 2));
