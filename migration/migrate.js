const admin = require("firebase-admin");

const serviceAccount = require("../keys/firebaseKey.json");

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const migrateDistance = (str) => {
	if (!str) {
		return {
			distanceLabel: null,
			distancesValues: {
				swim: null,
				bike: null,
				run: null,
			},
		};
	}

	const match = str.match(/^(\w+)\s*\(([^)]+)\)$/);
	if (!match)
		return {
			distanceLabel: null,
			distancesValues: {
				swim: null,
				bike: null,
				run: null,
			},
		};

	const label = match[1];
	const [swim, bike, run] = match[2].split("/").map((s) => s.trim());

	return {
		distanceLabel: label,
		distancesValues: {
			swim,
			bike,
			run,
		},
	};
};

const migrateTerrain = (value) => {
	switch (value) {
		case "Plat":
			return "flat";
		case "Montagneux":
			return "mountainous";
		case "Vallonné":
			return "hilly";
		case "Mixte":
			return "mixed";
		case "Je ne sais pas":
			return "unknown";
		default:
			return value;
	}
};

const migrateLevel = (value) => {
	switch (value) {
		case "Débutant":
			return "beginner";
		case "Intermédiaire":
			return "novice";
		case "Avancé":
			return "intermediate";
		case "Expert":
			return "advanced";

		default:
			return value;
	}
};

const timeToSecondes = (time) => {
	if (!time) return 0;
	const h = time.hours ? parseInt(time.hours) : 0;
	const m = time.minutes ? parseInt(time.minutes) : 0;
	const s = time.seconds ? parseInt(time.seconds) : 0;
	return h * 3600 + m * 60 + s;
};

const migrateTimeGoals = (times) => {
	return {
		globalSeconds: times && times.global ? timeToSecondes(times.global) : null,
		swimSeconds:
			times && times.swimming ? timeToSecondes(times.swimming) : null,
		bikeSeconds: times && times.biking ? timeToSecondes(times.biking) : null,
		runSeconds: times && times.running ? timeToSecondes(times.running) : null,
	};
};

async function migrateTriathlonGoals() {
	const snapshot = await db.collection("users").get();

	for (const doc of snapshot.docs) {
		const data = doc.data();

		const { triathlonGoals, ...rest } = data;
		console.log(triathlonGoals);

		const distance =
			triathlonGoals && triathlonGoals.distance
				? migrateDistance(triathlonGoals.distance)
				: {
						distanceLabel: null,
						distancesValues: {
							swim: null,
							bike: null,
							run: null,
						},
				  };
		const newData = {
			...rest,
			triathlonGoals: {
				primary: {
					raceDate:
						triathlonGoals && triathlonGoals.date ? triathlonGoals.date : null,
					raceName:
						triathlonGoals && triathlonGoals.name ? triathlonGoals.name : null,
					timeGoals:
						triathlonGoals && triathlonGoals.timeGoals
							? migrateTimeGoals(triathlonGoals.timeGoals)
							: {
									globalSeconds: null,
									swimSeconds: null,
									bikeSeconds: null,
									runSeconds: null,
							  },

					...distance,
					raceTerrain:
						triathlonGoals && triathlonGoals.fieldType
							? migrateTerrain(triathlonGoals.fieldType)
							: null,
				},
				secondary: [],
			},
		};

		await doc.ref.set(newData);
		console.log(`✅ Migrated ${doc.id}`);
	}

	console.log("🎉 Migration terminée !");
}

function migrateDayOfWeek(day) {
	switch (day) {
		case "Lundi":
			return "monday";
		case "Mardi":
			return "tuesday";
		case "Mercredi":
			return "wednesday";
		case "Jeudi":
			return "thursday";
		case "Vendredi":
			return "friday";
		case "Samedi":
			return "saturday";
		case "Dimanche":
			return "sunday";
		default:
			return day;
	}
}

async function migrateAthleteProfile() {
	const snapshot = await db.collection("users").get();

	for (const doc of snapshot.docs) {
		const data = doc.data();

		const { athleteProfile, ...rest } = data;

		const newData = {
			...rest,
			trainingStartDate:
				athleteProfile && athleteProfile.startDate
					? athleteProfile.startDate
					: null,
			profile: {
				gender: athleteProfile ? athleteProfile.gender : null,
				ageYears:
					athleteProfile && athleteProfile.age
						? Number(athleteProfile.age)
						: null,
				weightKg:
					athleteProfile && athleteProfile.weight
						? Number(athleteProfile.weight)
						: null,
				heightCm:
					athleteProfile && athleteProfile.height
						? Number(athleteProfile.height)
						: null,
			},
			triathlonExperience: {
				triathlonYears:
					athleteProfile && athleteProfile.experience
						? athleteProfile.experience
						: null,
				triathlonsCompleted:
					athleteProfile && athleteProfile.nbTriathlonExecuted
						? Number(athleteProfile.nbTriathlonExecuted)
						: null,
				level:
					athleteProfile && athleteProfile.level
						? migrateLevel(athleteProfile.level)
						: null,
				swimExperience: {
					level:
						athleteProfile &&
						athleteProfile.natationExperience &&
						athleteProfile.natationExperience.level
							? migrateLevel(athleteProfile.natationExperience.level)
							: null,
					distanceMeters:
						athleteProfile &&
						athleteProfile.natationExperience &&
						athleteProfile.natationExperience.distance
							? Number(athleteProfile.natationExperience.distance)
							: null,
					timeSeconds:
						athleteProfile &&
						athleteProfile.natationExperience &&
						athleteProfile.natationExperience.chrono
							? timeToSecondes(athleteProfile.natationExperience.chrono)
							: null,
				},
				runningExperience: {
					level:
						athleteProfile &&
						athleteProfile.runningExperience &&
						athleteProfile.runningExperience.level
							? migrateLevel(athleteProfile.runningExperience.level)
							: null,
					distanceMeters:
						athleteProfile &&
						athleteProfile.runningExperience &&
						athleteProfile.runningExperience.distance
							? Number(athleteProfile.runningExperience.distance)
							: null,
					timeSeconds:
						athleteProfile &&
						athleteProfile.runningExperience &&
						athleteProfile.runningExperience.chrono
							? timeToSecondes(athleteProfile.runningExperience.chrono)
							: null,
				},
				bikeExperience: {
					level:
						athleteProfile &&
						athleteProfile.bikeExperience &&
						athleteProfile.bikeExperience.level
							? migrateLevel(athleteProfile.bikeExperience.level)
							: null,
				},
				transitionComfort: {
					swimToBike:
						athleteProfile && athleteProfile.transitionSkills.swimToBike
							? athleteProfile.transitionSkills.swimToBike
							: null,
					bikeToRun:
						athleteProfile && athleteProfile.transitionSkills.bikeToRun
							? athleteProfile.transitionSkills.bikeToRun
							: null,
				},
			},
			club: {
				isMember:
					athleteProfile && athleteProfile.hasClubLicense
						? athleteProfile.hasClubLicense
						: null,
				name:
					athleteProfile && athleteProfile.club ? athleteProfile.club : null,
				lockedSessionsNote:
					athleteProfile && athleteProfile.clubSessions
						? athleteProfile.clubSessions
						: null,
			},
			metrics: {
				vmaKmh:
					athleteProfile && athleteProfile.vma
						? Number(athleteProfile.vma)
						: null,
				ftpWatts:
					athleteProfile && athleteProfile.ftp
						? Number(athleteProfile.ftp)
						: null,
			},
			targetMaxWeeklyTrainingHours:
				athleteProfile && athleteProfile.trainningHours
					? Number(athleteProfile.trainningHours)
					: null,
			targetWeeklyTrainingSessions:
				athleteProfile && athleteProfile.trainingSessions
					? Number(athleteProfile.trainingSessions)
					: null,
			currentWeeklyTrainingSessions:
				athleteProfile && athleteProfile.trainingFrequency
					? Number(athleteProfile.trainingFrequency)
					: null,
			averageSleepPerNightHours:
				athleteProfile && athleteProfile.sleepHours
					? Number(athleteProfile.sleepHours)
					: null,
			maxTrainingHoursPerDay: {
				monday:
					athleteProfile &&
					athleteProfile.availability &&
					athleteProfile.availability.Monday
						? Number(athleteProfile.availability.Monday)
						: 0,
				thursday:
					athleteProfile &&
					athleteProfile.availability &&
					athleteProfile.availability.Thursday
						? Number(athleteProfile.availability.Thursday)
						: 0,
				friday:
					athleteProfile &&
					athleteProfile.availability &&
					athleteProfile.availability.Friday
						? Number(athleteProfile.availability.Friday)
						: 0,
				sunday:
					athleteProfile &&
					athleteProfile.availability &&
					athleteProfile.availability.Sunday
						? Number(athleteProfile.availability.Sunday)
						: 0,
				wednesday:
					athleteProfile &&
					athleteProfile.availability &&
					athleteProfile.availability.Wednesday
						? Number(athleteProfile.availability.Wednesday)
						: 0,
				tuesday:
					athleteProfile &&
					athleteProfile.availability &&
					athleteProfile.availability.Tuesday
						? Number(athleteProfile.availability.Tuesday)
						: 0,
				saturday:
					athleteProfile &&
					athleteProfile.availability &&
					athleteProfile.availability.Saturday
						? Number(athleteProfile.availability.Saturday)
						: 0,
			},
			preferredRestDay:
				athleteProfile && athleteProfile.dayOff
					? migrateDayOfWeek(athleteProfile.dayOff)
					: null,
			injuriesNote:
				athleteProfile && athleteProfile.injuries
					? athleteProfile.injuries
					: null,
			equipment: {
				watch: null,
				hrSensor: false,
				swimGear: [],
				bike: {
					cadenceSensor: false,
					powerMeter: !!(athleteProfile && athleteProfile.ftp),
					bikeType: null,
					homeTrainer: false,
				},
				run: {
					treadmill: false,
				},
			},
		};

		await doc.ref.set(newData);
		console.log(`✅ Migrated ${doc.id}`);
	}

	console.log("🎉 Migration terminée !");
}

migrateTriathlonGoals();
//migrateAthleteProfile();
