const Database = require('better-sqlite3');
const db = new Database('dev.db');

console.log('📋 All tables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log('  -', t.name));

console.log('\n📊 Voter table (last 10):');
const voters = db.prepare('SELECT * FROM Voter ORDER BY votedAt DESC LIMIT 10').all();
if (voters.length === 0) {
  console.log('  (no voters yet)');
} else {
  voters.forEach(v => {
    console.log(`  ID: ${v.id}`);
    console.log(`    Email: ${v.upMail}`);
    console.log(`    StudentID: ${v.studentId}`);
    console.log(`    Voted: ${v.hasVoted ? 'Yes' : 'No'}`);
    console.log(`    VotedAt: ${v.votedAt || 'N/A'}`);
    console.log('');
  });
}

db.close();
