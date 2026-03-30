const admin = require("firebase-admin");
const readline = require("readline");
const { v4: uuidv4 } = require("uuid");

const serviceAccount = require("./firebaseKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function promptUserIdAndSendMessage() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	rl.question(
		"➡️ Entrez le user ID (chatId) destinataire : ",
		async (chatId) => {
			rl.question("✉️ Entrez le contenu du message : ", async (text) => {
				rl.close();
				await sendTestMessage(chatId, text);
			});
		}
	);
}

async function sendTestMessage(chatId, text) {
	const message = {
		senderId: "igRDQXYLU4SryOuLX7uoHqBtKQ22",
		text: text,
		createdAt: admin.firestore.FieldValue.serverTimestamp(),
	};

	const messageRef = await db
		.collection("chats")
		.doc(chatId)
		.collection("messages")
		.add(message);

	console.log(
		`✅ Message envoyé à "${chatId}" avec ID généré : ${messageRef.id}`
	);
}

promptUserIdAndSendMessage();
