// --- CẤU HÌNH ---
const CONFIG = {
	pitchWidth: 130,
	pitchLength: 200,
	playerSpeed: 0.6,
	sprintSpeed: 1.15,
	homeSpeedFactor: 1,
	awaySpeedFactor: 1,
	dribbleFactor: 0.75,
	ballFriction: 0.90,
	shootForce: 5.0,
	passForce: 2.5,
	lobForce: 6.2, // Lực chuyền bổng
	tackleRange: 4.5,
	dribbleRange: 6.5,
	headerHeight: 2.5,
	switchPlayerRadius: 200,
	matchDuration: 240,
};

// --- CHIẾN THUẬT (Tactics) ---
// Sân dài 200 (Home Z > 0, Away Z < 0)
const FORMATIONS = {
	"2-3-1": [
		{ x: -25, z: 60 },
		{ x: 25, z: 60 },
		{ x: -35, z: 30 },
		{ x: 0, z: 40 },
		{ x: 35, z: 30 },
		{ x: 0, z: 5 },
	],
	"3-2-1": [
		{ x: -30, z: 60 },
		{ x: 0, z: 65 },
		{ x: 30, z: 60 },
		{ x: -15, z: 30 },
		{ x: 15, z: 30 },
		{ x: 0, z: 5 },
	],
	"2-2-2": [
		{ x: -20, z: 60 },
		{ x: 20, z: 60 },
		{ x: -25, z: 35 },
		{ x: 25, z: 35 },
		{ x: -10, z: 10 },
		{ x: 10, z: 10 },
	],
	"1-4-1": [
		{ x: 0, z: 70 },
		{ x: -30, z: 40 },
		{ x: -10, z: 45 },
		{ x: 10, z: 45 },
		{ x: 30, z: 40 },
		{ x: 0, z: 5 },
	],
};

// --- GLOBAL VARIABLES ---
let scene, camera, renderer;
let ball, pitch;
let players = [];
let goalHome, goalAway;
let activePlayer = null;
let lastTouchPlayer = null;
let minimapCanvas, minimapCtx;

let scores = { home: 0, away: 0 };
let gameTime = 0;
let isGoalScored = false;
let gameActive = false;
let matchStarted = false;
let currentFormations = { home: "2-3-1", away: "2-3-1" };
let lastKickTime = -1; // Biến mới: Thời điểm thực hiện cú đá cuối cùng

const keys = {
	w: false,
	a: false,
	s: false,
	d: false,
	shift: false,
	space: false,
	e: false,
	f: false, // Phím F cho chuyền bổng
};

const actionFlags = {
	pass: false,
	shoot: false,
	tackle: false,
	jump: false,
	lob: false, // Cờ cho hành động lob
};

const homeNames = [
	"Martinez (GK)",
	"Van Dijk",
	"Ramos",
	"De Bruyne",
	"Modric",
	"Messi",
	"Haaland",
];
const awayNames = [
	"Courtois (GK)",
	"Rudiger",
	"Saliba",
	"Rodri",
	"Bellingham",
	"Vinicius",
	"Mbappe",
];

// --- INIT ---
function init() {
	randomizeFormations();
	createMinimapUI();

	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x87ceeb);
	scene.fog = new THREE.Fog(0x87ceeb, 200, 600);

	camera = new THREE.PerspectiveCamera(
		40,
		window.innerWidth / window.innerHeight,
		0.1,
		1000
	);
	camera.position.set(0, 100, 150);
	camera.lookAt(0, 0, 0);

	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	document.body.appendChild(renderer.domElement);

	// Lights
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
	scene.add(ambientLight);
	const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
	dirLight.position.set(100, 200, 100);
	dirLight.castShadow = true;
	dirLight.shadow.mapSize.width = 4096;
	dirLight.shadow.mapSize.height = 4096;
	dirLight.shadow.camera.left = -200;
	dirLight.shadow.camera.right = 200;
	dirLight.shadow.camera.top = 200;
	dirLight.shadow.camera.bottom = -200;
	scene.add(dirLight);

	createPitch();
	createBall();
	createTeams();
	createGoals();

	window.addEventListener("resize", onWindowResize);
	document.addEventListener("keydown", (e) => handleKey(e, true));
	document.addEventListener("keyup", (e) => handleKey(e, false));

	// Mouse Events
	document.addEventListener("mousedown", (e) => {
		if (!gameActive) return;

		if (e.button === 0) {
			const distToBall = activePlayer
				? activePlayer.mesh.position.distanceTo(ball.position)
				: Infinity;
			if (distToBall > CONFIG.dribbleRange * 2) {
				manualSwitchPlayer();
			} else {
				actionFlags.pass = true;
			}
		}

		if (e.button === 2) actionFlags.shoot = true;
	});

	document.addEventListener("contextmenu", (event) => event.preventDefault());

	animate();
}

function createMinimapUI() {
	const div = document.createElement("div");
	div.id = "minimap-container";
	div.style.position = "absolute";
	div.style.bottom = "20px";
	div.style.right = "20px";
	div.style.width = "180px";
	div.style.height = "260px";
	div.style.backgroundColor = "rgba(0, 50, 0, 0.8)";
	div.style.border = "2px solid rgba(255, 255, 255, 0.5)";
	div.style.borderRadius = "10px";
	div.style.zIndex = "900";
	div.style.overflow = "hidden";

	minimapCanvas = document.createElement("canvas");
	minimapCanvas.width = 180;
	minimapCanvas.height = 260;
	div.appendChild(minimapCanvas);
	document.body.appendChild(div);
	minimapCtx = minimapCanvas.getContext("2d");
}

function updateMinimap() {
	if (!minimapCtx) return;

	const w = minimapCanvas.width;
	const h = minimapCanvas.height;

	minimapCtx.clearRect(0, 0, w, h);

	minimapCtx.strokeStyle = "rgba(255,255,255,0.3)";
	minimapCtx.lineWidth = 2;
	minimapCtx.beginPath();
	minimapCtx.moveTo(0, h / 2);
	minimapCtx.lineTo(w, h / 2);
	minimapCtx.stroke();

	minimapCtx.beginPath();
	minimapCtx.arc(w / 2, h / 2, 20, 0, Math.PI * 2);
	minimapCtx.stroke();

	const mapX = (x) => ((x + CONFIG.pitchWidth / 2) / CONFIG.pitchWidth) * w;
	const mapY = (z) => ((z + CONFIG.pitchLength / 2) / CONFIG.pitchLength) * h;

	players.forEach((p) => {
		const x = mapX(p.mesh.position.x);
		const y = mapY(p.mesh.position.z);

		minimapCtx.fillStyle = p.team === "home" ? "#3498db" : "#e74c3c";
		minimapCtx.beginPath();
		minimapCtx.arc(x, y, 3, 0, Math.PI * 2);
		minimapCtx.fill();
	});

	const bx = mapX(ball.position.x);
	const by = mapY(ball.position.z);
	minimapCtx.fillStyle = "#ffff00";
	minimapCtx.beginPath();
	minimapCtx.arc(bx, by, 4, 0, Math.PI * 2);
	minimapCtx.fill();
}

function startGame() {
	const startScreen = document.getElementById("start-screen");
	startScreen.innerHTML = "";

	let count = 5;
	const countDisplay = document.createElement("h1");
	countDisplay.style.fontSize = "120px";
	countDisplay.style.color = "#f1c40f";
	countDisplay.style.textShadow = "0 0 20px rgba(0,0,0,0.5)";
	countDisplay.innerText = count;
	startScreen.appendChild(countDisplay);

	const interval = setInterval(() => {
		count--;
		if (count > 0) {
			countDisplay.innerText = count;
		} else {
			clearInterval(interval);
			countDisplay.innerText = "START!";
			setTimeout(() => {
				startScreen.style.display = "none";
				gameActive = true;
				matchStarted = false;
				gameTime = 0;
				lastKickTime = -1;
			}, 500);
		}
	}, 1000);
}

function endGame() {
	gameActive = false;
	matchStarted = false;
	const overlay = document.getElementById("start-screen");
	overlay.style.display = "flex";
	overlay.innerHTML = `
        <h1>HẾT GIỜ</h1>
        <h2 style="font-size: 40px; margin: 10px 0;">${scores.home} - ${scores.away}</h2>
        <button id="start-btn" onclick="location.reload()">CHƠI LẠI</button>
    `;
}

function randomizeFormations() {
	const keys = Object.keys(FORMATIONS);
	currentFormations.home = keys[Math.floor(Math.random() * keys.length)];
	currentFormations.away = keys[Math.floor(Math.random() * keys.length)];

	const ui = document.getElementById("formation-display");
	if (ui)
		ui.innerHTML = `Home: ${currentFormations.home}<br>Away: ${currentFormations.away}`;
}

// --- CREATION FUNCTIONS ---
function createPitch() {
	const geometry = new THREE.PlaneGeometry(
		CONFIG.pitchWidth,
		CONFIG.pitchLength
	);
	const material = new THREE.MeshPhongMaterial({ color: 0x4caf50 });
	pitch = new THREE.Mesh(geometry, material);
	pitch.rotation.x = -Math.PI / 2;
	pitch.receiveShadow = true;
	scene.add(pitch);

	const lineMat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		opacity: 0.5,
		transparent: true,
	});
	const createLine = (w, h, x, z) => {
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(x, 0.05, z);
		scene.add(mesh);
	};

	createLine(CONFIG.pitchWidth, 1, 0, CONFIG.pitchLength / 2);
	createLine(CONFIG.pitchWidth, 1, 0, -CONFIG.pitchLength / 2);
	createLine(1, CONFIG.pitchLength, CONFIG.pitchWidth / 2, 0);
	createLine(1, CONFIG.pitchLength, -CONFIG.pitchWidth / 2, 0);
	createLine(CONFIG.pitchWidth, 1, 0, 0);

	const circle = new THREE.Mesh(new THREE.RingGeometry(12, 13, 32), lineMat);
	circle.rotation.x = -Math.PI / 2;
	circle.position.y = 0.05;
	scene.add(circle);

	const boxW = 50,
		boxH = 25;
	createLine(boxW, 1, 0, CONFIG.pitchLength / 2 - boxH);
	createLine(1, boxH, -boxW / 2, CONFIG.pitchLength / 2 - boxH / 2);
	createLine(1, boxH, boxW / 2, CONFIG.pitchLength / 2 - boxH / 2);
	createLine(boxW, 1, 0, -CONFIG.pitchLength / 2 + boxH);
	createLine(1, boxH, -boxW / 2, -CONFIG.pitchLength / 2 + boxH / 2);
	createLine(1, boxH, boxW / 2, -CONFIG.pitchLength / 2 + boxH / 2);
}

function createGoals() {
	const goalGeo = new THREE.BoxGeometry(36, 12, 4);
	const goalMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
	goalHome = new THREE.Mesh(goalGeo, goalMat);
	goalHome.position.set(0, 6, CONFIG.pitchLength / 2 + 2);
	scene.add(goalHome);
	goalAway = new THREE.Mesh(goalGeo, goalMat);
	goalAway.position.set(0, 6, -CONFIG.pitchLength / 2 - 2);
	scene.add(goalAway);
}

function createBall() {
	ball = new THREE.Mesh(
		new THREE.SphereGeometry(1.3, 32, 32),
		new THREE.MeshStandardMaterial({
			color: 0xffad00, // Màu cam đỏ rực
			roughness: 0.3,
			emissive: 0x330000, // Phát sáng nhẹ
		})
	);
	ball.castShadow = true;
	ball.position.set(0, 1.3, 0);
	ball.velocity = new THREE.Vector3(0, 0, 0);
	scene.add(ball);
}

function createTeams() {
	// --- HOME TEAM ---
	createPlayer(0, 0, 90, "home", homeNames[0], true);
	const homeForm = FORMATIONS[currentFormations.home];
	for (let i = 0; i < 6; i++) {
		let pos = homeForm[i];
		createPlayer(i + 1, pos.x, pos.z, "home", homeNames[i + 1]);
	}

	// --- AWAY TEAM ---
	createPlayer(7, 0, -90, "away", awayNames[0], true);
	const awayForm = FORMATIONS[currentFormations.away];
	for (let i = 0; i < 6; i++) {
		let pos = awayForm[i];
		createPlayer(i + 8, -pos.x, -pos.z, "away", awayNames[i + 1]);
	}
}

function createPlayer(id, x, z, team, name, isGK = false) {
	const group = new THREE.Group();
	const color =
		team === "home"
			? isGK
				? 0xf39c12
				: 0x3498db
			: isGK
			? 0x27ae60
			: 0xe74c3c;

	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(1.6, 1.6, 4.5, 16),
		new THREE.MeshLambertMaterial({ color: color })
	);
	body.position.y = 2.25;
	body.castShadow = true;
	group.add(body);

	const head = new THREE.Mesh(
		new THREE.SphereGeometry(1.3, 16, 16),
		new THREE.MeshLambertMaterial({ color: 0xffdbac })
	);
	head.position.y = 5.2;
	group.add(head);

	group.position.set(x, 0, z);
	scene.add(group);

	const div = document.createElement("div");
	div.className = "player-label";
	div.textContent = name;
	document.body.appendChild(div);

	const marker = document.createElement("div");
	marker.className = "player-marker";
	document.body.appendChild(marker);

	const basePos = new THREE.Vector3(x, 0, z);

	players.push({
		id: id,
		mesh: group,
		team: team,
		isGK: isGK,
		name: name,
		velocity: new THREE.Vector3(),
		div: div,
		marker: marker,
		canJump: true,
		isJumping: false,
		jumpVel: 0,
		basePosition: basePos,
	});
}

function handleKey(e, isDown) {
	const k = e.key.toLowerCase();
	if (k === "w") keys.w = isDown;
	if (k === "a") keys.a = isDown;
	if (k === "s") keys.s = isDown;
	if (k === "d") keys.d = isDown;
	if (k === "shift") keys.shift = isDown;
	if (k === " ") {
		if (isDown && !keys.space) actionFlags.jump = true;
		keys.space = isDown;
	}
	if (k === "e") {
		if (isDown && !keys.e) actionFlags.tackle = true;
		keys.e = isDown;
	}
	// Phím F cho chuyền bổng
	if (k === "f") {
		if (isDown && !keys.f) actionFlags.lob = true;
		keys.f = isDown;
	}
}

// --- GAME LOGIC ---

function switchPlayerLogic() {
	if (activePlayer && activePlayer.team === "home") {
		const currentDist = activePlayer.mesh.position.distanceTo(
			ball.position
		);
		if (currentDist < 30) return;
	}
	manualSwitchPlayer();
}

function manualSwitchPlayer() {
	let minDist = Infinity;
	let closestPlayer = null;
	players.forEach((p) => {
		if (p.team === "home" && !p.isGK) {
			const dist = p.mesh.position.distanceTo(ball.position);
			if (dist < minDist) {
				minDist = dist;
				closestPlayer = p;
			}
		}
	});

	if (closestPlayer && closestPlayer !== activePlayer) {
		activePlayer = closestPlayer;
	}
}

function getTacticalTarget(p) {
	let target = p.basePosition.clone();
	const shiftZ = ball.position.z * 0.5;
	const shiftX = ball.position.x * 0.3;

	target.z += shiftZ;
	target.x += shiftX;

	if (p.team === "away" && !p.isGK) {
		target.z = Math.max(-80, target.z);
	} else if (p.team === "home" && !p.isGK) {
		target.z = Math.min(80, target.z);
	}

	target.x = Math.max(
		-CONFIG.pitchWidth / 2 + 2,
		Math.min(CONFIG.pitchWidth / 2 - 2, target.x)
	);
	target.z = Math.max(
		-CONFIG.pitchLength / 2 + 5,
		Math.min(CONFIG.pitchLength / 2 - 5, target.z)
	);

	return target;
}

function updatePhysics() {
	if (isGoalScored || !gameActive) return;

	if (!matchStarted) {
		if (
			keys.w ||
			keys.a ||
			keys.s ||
			keys.d ||
			actionFlags.pass ||
			actionFlags.shoot ||
			actionFlags.jump ||
			actionFlags.tackle
		) {
			matchStarted = true;
		}
	}

	ball.velocity.y -= 0.15;
	ball.position.add(ball.velocity);

	if (ball.position.y < 1.3) {
		ball.position.y = 1.3;
		ball.velocity.y *= -0.6;
		ball.velocity.multiplyScalar(CONFIG.ballFriction);
	} else {
		ball.velocity.x *= 0.99;
		ball.velocity.z *= 0.99;
	}

	if (Math.abs(ball.position.x) > CONFIG.pitchWidth / 2) {
		ball.velocity.x *= -0.8;
		ball.position.x =
			Math.sign(ball.position.x) * (CONFIG.pitchWidth / 2 - 1);
	}
	if (Math.abs(ball.position.z) > CONFIG.pitchLength / 2) {
		if (Math.abs(ball.position.x) < 18) {
			checkGoal();
		} else {
			ball.velocity.z *= -0.8;
			ball.position.z =
				Math.sign(ball.position.z) * (CONFIG.pitchLength / 2 - 1);
		}
	}
	ball.rotation.x += ball.velocity.z * 0.1;
	ball.rotation.z -= ball.velocity.x * 0.1;

	let closestDistGlobal = Infinity;
	let closestPlayerGlobal = null;
	let closestAwayDist = Infinity;
	let closestAway = null;

	players.forEach((p) => {
		const realDist = p.mesh.position.distanceTo(ball.position);

		let effectiveDist = realDist;
		if (ball.position.z > 0 && p.team === "home") {
			effectiveDist *= 0.6;
		} else if (ball.position.z < 0 && p.team === "away") {
			effectiveDist *= 0.6;
		}

		if (effectiveDist < closestDistGlobal) {
			closestDistGlobal = effectiveDist;
			closestPlayerGlobal = p;
		}

		if (p.team === "away" && !p.isGK) {
			if (realDist < closestAwayDist) {
				closestAwayDist = realDist;
				closestAway = p;
			}
		}
	});

	players.forEach((p) => {
		if (!p.isJumping) {
			p.mesh.position.y = 0;
		} else {
			p.jumpVel -= 0.2;
			p.mesh.position.y += p.jumpVel;
			if (p.mesh.position.y <= 0) {
				p.mesh.position.y = 0;
				p.isJumping = false;
				p.jumpVel = 0;
			}
		}

		let moveDir = new THREE.Vector3(0, 0, 0);
		let speed = CONFIG.playerSpeed;

		if (p.team === "away") {
			speed *= CONFIG.awaySpeedFactor;
		} else {
			speed *= CONFIG.homeSpeedFactor;
		}

		// Tốc độ giảm khi dắt bóng
		if (
			p === closestPlayerGlobal &&
			closestDistGlobal < CONFIG.dribbleRange
		) {
			speed *= CONFIG.dribbleFactor;
		}

		if (p === activePlayer) {
			if (keys.shift) speed = CONFIG.sprintSpeed;
			if (keys.w) moveDir.z = -1;
			if (keys.s) moveDir.z = 1;
			if (keys.a) moveDir.x = -1;
			if (keys.d) moveDir.x = 1;

			if (actionFlags.jump) {
				handleJumpOrHeader(p);
				actionFlags.jump = false;
			}
			if (actionFlags.pass) {
				handlePass(p);
				actionFlags.pass = false;
			}
			if (actionFlags.shoot) {
				handleShoot(p);
				actionFlags.shoot = false;
			}
			if (actionFlags.tackle) {
				handleTackle(p);
				actionFlags.tackle = false;
			}
			// Chuyền bổng
			if (actionFlags.lob) {
				handleLobPass(p);
				actionFlags.lob = false;
			}

			// --- AUTO SHOOT (HOME TEAM) ---
			if (
				p.team === "home" &&
				p.mesh.position.z < -65 &&
				Math.abs(p.mesh.position.x) < 25
			) {
				const dist = p.mesh.position.distanceTo(ball.position);
				if (dist < CONFIG.dribbleRange) {
					if (Math.random() < 0.05) handleShoot(p);
				}
			}
		} else {
			if (matchStarted) {
				if (p.isGK) {
					let goalZ =
						p.team === "home"
							? CONFIG.pitchLength / 2 - 5
							: -CONFIG.pitchLength / 2 + 5;
					let isDanger =
						(p.team === "home" && ball.position.z > 0) ||
						(p.team === "away" && ball.position.z < 0);

					if (isDanger) {
						let distToBall = p.mesh.position.distanceTo(
							ball.position
						);
						if (distToBall > 30) {
							let optimalX = ball.position.x * 0.4;
							optimalX = Math.max(-8, Math.min(8, optimalX));
							let diffX = optimalX - p.mesh.position.x;
							if (Math.abs(diffX) > 2)
								moveDir.x = Math.sign(diffX) * 0.4;
						} else {
							let targetX = Math.max(
								-16,
								Math.min(16, ball.position.x)
							);
							// GK di chuyển ngang để đón bóng
							let dir = new THREE.Vector3(
								targetX - p.mesh.position.x,
								0,
								0
							);
							if (dir.length() > 0.5)
								moveDir.copy(dir.normalize());
						}
					} else {
						let diffX = 0 - p.mesh.position.x;
						if (Math.abs(diffX) > 1)
							moveDir.x = Math.sign(diffX) * 0.3;
					}

					// --- LOGIC CẢN PHÁ (BLOCK/SAVE) CẢI TIẾN ---
					// 1. Kiểm tra khoảng cách thông thường (va chạm trực tiếp)
					let dist = p.mesh.position.distanceTo(ball.position);
					let caught = false;

					if (dist < 3.0) {
						caught = true;
					}
					// 2. Kiểm tra bóng bay ngang (Reflex Save)
					else {
						let diffX = Math.abs(
							p.mesh.position.x - ball.position.x
						);
						let diffZ = Math.abs(
							p.mesh.position.z - ball.position.z
						);

						// Điều kiện: Bóng ngang người (Z < 3.0) VÀ trong tầm với (X < 9.0) VÀ bóng đang bay
						if (
							diffZ < 3.0 &&
							diffX < 9.0 &&
							ball.velocity.length() > 1.0
						) {
							// Tự động "bay người" tới bóng (dịch chuyển vị trí GK)
							// Lerp GK tới vị trí chặn bóng trên trục X
							p.mesh.position.x = THREE.MathUtils.lerp(
								p.mesh.position.x,
								ball.position.x,
								0.3
							);

							// Nếu đã đủ gần sau khi bay người -> Bắt/Đẩy
							if (
								p.mesh.position.distanceTo(ball.position) < 5.0
							) {
								caught = true;
							}
						}
					}

					if (caught) {
						// Đẩy bóng ra xa
						ball.velocity.z *= -0.6; // Bật ngược nhẹ hơn (cũ -0.8)

						// Tạo lực đẩy sang ngang (đẩy ra biên)
						let pushSide = ball.position.x - p.mesh.position.x;
						if (Math.abs(pushSide) < 0.1)
							pushSide = (Math.random() - 0.5) * 2;
						ball.velocity.x += Math.sign(pushSide) * 2.0;

						// Nảy thấp hơn (cũ: * 0.6 + 2.0)
						ball.velocity.y = Math.abs(ball.velocity.y) * 0.3 + 0.8;

						// Hiệu ứng nhảy lên
						if (!p.isJumping) {
							p.isJumping = true;
							p.jumpVel = 0.8;
						}
						lastTouchPlayer = p;
					}
				} else {
					if (p.team === "away") {
						if (
							p === closestPlayerGlobal &&
							closestDistGlobal < CONFIG.dribbleRange
						) {
							let goalPos = new THREE.Vector3(
								0,
								0,
								CONFIG.pitchLength / 2 + 5
							);
							let dir = new THREE.Vector3().subVectors(
								goalPos,
								p.mesh.position
							);
							dir.y = 0;
							moveDir.copy(dir.normalize());
							speed *= CONFIG.sprintSpeed;

							if (
								p.mesh.position.z > 60 &&
								Math.abs(p.mesh.position.x) < 25
							) {
								if (Math.random() < 0.05) handleShoot(p);
							}
						} else if (p === closestAway) {
							let target = ball.position.clone();
							let dir = new THREE.Vector3().subVectors(
								target,
								p.mesh.position
							);
							dir.y = 0;
							if (dir.length() > 0.5)
								moveDir.copy(dir.normalize());
							speed *= 1.05;

							if (
								closestDistGlobal < CONFIG.tackleRange + 2 &&
								p.mesh.position.distanceTo(ball.position) <
									CONFIG.tackleRange
							) {
								if (Math.random() < 0.03) {
									handleTackle(p);
								}
							}
						} else {
							let target = getTacticalTarget(p);
							let dir = new THREE.Vector3().subVectors(
								target,
								p.mesh.position
							);
							dir.y = 0;
							if (dir.length() > 2.0) {
								moveDir
									.copy(dir.normalize())
									.multiplyScalar(0.7);
							}
						}
					} else {
						if (
							p === closestPlayerGlobal &&
							closestDistGlobal < CONFIG.dribbleRange
						) {
							let goalPos = new THREE.Vector3(
								0,
								0,
								-CONFIG.pitchLength / 2 - 5
							);
							let dir = new THREE.Vector3().subVectors(
								goalPos,
								p.mesh.position
							);
							dir.y = 0;
							moveDir.copy(dir.normalize());
							speed *= CONFIG.sprintSpeed;

							if (
								p.mesh.position.z < -65 &&
								Math.abs(p.mesh.position.x) < 25
							) {
								if (Math.random() < 0.05) handleShoot(p);
							}
						} else {
							let target;
							if (ball.position.z > 0) {
								target = ball.position.clone();
							} else {
								target = getTacticalTarget(p);
							}

							let distToBall = p.mesh.position.distanceTo(
								ball.position
							);
							if (
								distToBall < 20 &&
								activePlayer &&
								activePlayer.id !== p.id
							) {
							} else if (distToBall < 20) {
								target = ball.position.clone();
							}

							let dir = new THREE.Vector3().subVectors(
								target,
								p.mesh.position
							);
							dir.y = 0;
							if (dir.length() > 1.0) {
								let aiSpeed = 1;
								if (ball.position.z > 0) aiSpeed = 1.1;
								moveDir
									.copy(dir.normalize())
									.multiplyScalar(aiSpeed);
							}
						}
					}
				}
			}
		}

		if (moveDir.length() > 0) {
			let moveVec = moveDir.clone();
			if (!p.isGK) moveVec.normalize().multiplyScalar(speed);
			p.mesh.position.add(moveVec);
			p.mesh.lookAt(
				p.mesh.position.x + moveDir.x,
				p.mesh.position.y,
				p.mesh.position.z + moveDir.z
			);
		}

		const dist = p.mesh.position.distanceTo(ball.position);

		let checkDist = dist;
		if (ball.position.z > 0 && p.team === "home") checkDist *= 0.6;
		else if (ball.position.z < 0 && p.team === "away") checkDist *= 0.6;

		// --- MAGNETIC DRIBBLE with COOLDOWN ---
		// Thêm điều kiện: gameTime - lastKickTime > 0.15 để ngắt nam châm sau khi sút
		if (
			p === closestPlayerGlobal &&
			checkDist < CONFIG.dribbleRange &&
			ball.position.y < 2 &&
			!p.isGK &&
			gameTime - lastKickTime > 0.3
		) {
			const ballSpeed = ball.velocity.length();
			if (ballSpeed > 8.0) {
				ball.velocity.multiplyScalar(0.4);
				ball.velocity.x += (Math.random() - 0.5) * 2;
				ball.velocity.y = 2.0;
				lastTouchPlayer = p;
			} else {
				const facing = new THREE.Vector3();
				p.mesh.getWorldDirection(facing);
				const dribbleSpot = p.mesh.position
					.clone()
					.add(facing.multiplyScalar(2.0));

				ball.position.lerp(dribbleSpot, 0.2);

				if (moveDir.length() > 0) {
					ball.velocity
						.copy(moveDir)
						.normalize()
						.multiplyScalar(speed * 1.1);
				} else {
					ball.velocity.multiplyScalar(0.7);
				}

				lastTouchPlayer = p;
			}
		}

		p.mesh.position.x = Math.max(
			-CONFIG.pitchWidth / 2,
			Math.min(CONFIG.pitchWidth / 2, p.mesh.position.x)
		);
		p.mesh.position.z = Math.max(
			-CONFIG.pitchLength / 2,
			Math.min(CONFIG.pitchLength / 2, p.mesh.position.z)
		);
	});
}

function handleJumpOrHeader(p) {
	const dist = p.mesh.position.distanceTo(ball.position);
	if (!p.isJumping) {
		p.isJumping = true;
		p.jumpVel = 1.5;
	}

	if (
		dist < CONFIG.dribbleRange + 2.0 &&
		ball.position.y > CONFIG.headerHeight
	) {
		lastKickTime = gameTime; // Reset cooldown
		lastTouchPlayer = p;
		let goalPos =
			p.team === "home"
				? new THREE.Vector3(0, 0, -CONFIG.pitchLength / 2)
				: new THREE.Vector3(0, 0, CONFIG.pitchLength / 2);

		let headerDir = new THREE.Vector3()
			.subVectors(goalPos, p.mesh.position)
			.normalize();
		headerDir.y = -0.3;
		ball.velocity.copy(headerDir.multiplyScalar(CONFIG.shootForce * 1.1));
	}
}

function handleShoot(p) {
	const dist = p.mesh.position.distanceTo(ball.position);
	if (dist < CONFIG.dribbleRange + 2.0) {
		lastKickTime = gameTime; // Reset cooldown để ngắt nam châm hút bóng
		lastTouchPlayer = p;
		let goalPos =
			p.team === "home"
				? new THREE.Vector3(0, 0, -CONFIG.pitchLength / 2)
				: new THREE.Vector3(0, 0, CONFIG.pitchLength / 2);

		let shootDir = new THREE.Vector3()
			.subVectors(goalPos, p.mesh.position)
			.normalize();
		shootDir.y = 0.3;
		shootDir.x += (Math.random() - 0.5) * 0.3;

		ball.velocity.set(0, 0, 0);
		ball.velocity.copy(shootDir.multiplyScalar(CONFIG.shootForce));
	}
}

function handlePass(p) {
	const dist = p.mesh.position.distanceTo(ball.position);
	if (dist < CONFIG.dribbleRange + 2.0) {
		lastKickTime = gameTime; // Reset cooldown
		lastTouchPlayer = p;
		let bestMate = null;
		let maxScore = -Infinity;
		let facing = new THREE.Vector3();
		p.mesh.getWorldDirection(facing);

		players.forEach((mate) => {
			if (mate.team === p.team && mate.id !== p.id) {
				let dirToMate = new THREE.Vector3()
					.subVectors(mate.mesh.position, p.mesh.position)
					.normalize();
				let angleScore = facing.dot(dirToMate);
				if (angleScore > 0.5) {
					let d = p.mesh.position.distanceTo(mate.mesh.position);
					let score = angleScore * 100 - d;
					if (score > maxScore) {
						maxScore = score;
						bestMate = mate;
					}
				}
			}
		});

		ball.velocity.set(0, 0, 0);

		if (bestMate) {
			let passDir = new THREE.Vector3()
				.subVectors(bestMate.mesh.position, p.mesh.position)
				.normalize();
			passDir.y = 0.1;
			ball.velocity.copy(passDir.multiplyScalar(CONFIG.passForce));
		} else {
			let passDir = facing.clone();
			passDir.y = 0.1;
			ball.velocity.copy(passDir.multiplyScalar(CONFIG.passForce));
		}
	}
}

function handleLobPass(p) {
	const dist = p.mesh.position.distanceTo(ball.position);
	if (dist < CONFIG.dribbleRange + 2.0) {
		lastKickTime = gameTime;
		lastTouchPlayer = p;
		let bestMate = null;
		let maxScore = -Infinity;
		let facing = new THREE.Vector3();
		p.mesh.getWorldDirection(facing);

		players.forEach((mate) => {
			if (mate.team === p.team && mate.id !== p.id) {
				let dirToMate = new THREE.Vector3()
					.subVectors(mate.mesh.position, p.mesh.position)
					.normalize();
				let angleScore = facing.dot(dirToMate);
				if (angleScore > 0.5) {
					let d = p.mesh.position.distanceTo(mate.mesh.position);
					let score = angleScore * 100 - d;
					if (score > maxScore) {
						maxScore = score;
						bestMate = mate;
					}
				}
			}
		});

		ball.velocity.set(0, 0, 0);

		if (bestMate) {
			let passDir = new THREE.Vector3()
				.subVectors(bestMate.mesh.position, p.mesh.position)
				.normalize();
			passDir.y = 0.5; // Góc cao cho chuyền bổng
			ball.velocity.copy(passDir.multiplyScalar(CONFIG.lobForce));
		} else {
			let passDir = facing.clone();
			passDir.y = 0.5;
			ball.velocity.copy(passDir.multiplyScalar(CONFIG.lobForce));
		}
	}
}

function handleTackle(p) {
	if (!p.isJumping) {
		p.jumpVel = 0.5;
		p.isJumping = true;
	}
	let facing = new THREE.Vector3();
	p.mesh.getWorldDirection(facing);
	p.mesh.position.add(facing.multiplyScalar(2));
	if (p.mesh.position.distanceTo(ball.position) < CONFIG.tackleRange) {
		lastKickTime = gameTime; // Tackle cũng tạo cooldown ngắn
		let tackleDir = facing.clone();
		tackleDir.x += Math.random() - 0.5;
		tackleDir.y = 0.5;
		ball.velocity.copy(tackleDir.multiplyScalar(2.0));
		lastTouchPlayer = p;
	}
}

function checkGoal() {
	if (isGoalScored) return;
	if (ball.position.z < -CONFIG.pitchLength / 2 + 2) scoreGoal("home");
	else if (ball.position.z > CONFIG.pitchLength / 2 - 2) scoreGoal("away");
}

function scoreGoal(team) {
	isGoalScored = true;
	const msg = document.getElementById("goal-message");
	msg.classList.add("show");

	let scorerName = "";
	if (lastTouchPlayer && lastTouchPlayer.team === team) {
		scorerName = lastTouchPlayer.name;
	} else {
		scorerName = team === "home" ? homeNames[6] : awayNames[6];
	}

	msg.innerText = `GOAL! ${scorerName}!`;

	if (team === "home") scores.home++;
	else scores.away++;
	updateScoreboard();
	setTimeout(resetGame, 2500);
}

function resetGame() {
	isGoalScored = false;
	document.getElementById("goal-message").classList.remove("show");
	ball.position.set(0, 1.5, 0);
	ball.velocity.set(0, 0, 0);
	lastTouchPlayer = null;
	matchStarted = false;
	lastKickTime = -1; // Reset cooldown

	players.forEach((p) => {
		p.velocity.set(0, 0, 0);
		let startPos;
		if (p.isGK) {
			startPos =
				p.team === "home"
					? new THREE.Vector3(0, 0, 90)
					: new THREE.Vector3(0, 0, -90);
		} else {
			let form =
				FORMATIONS[
					p.team === "home"
						? currentFormations.home
						: currentFormations.away
				];
			let index = p.id < 7 ? p.id - 1 : p.id - 8;
			let offset = form[index];
			if (p.team === "home") {
				startPos = new THREE.Vector3(offset.x, 0, offset.z);
			} else {
				startPos = new THREE.Vector3(-offset.x, 0, -offset.z);
			}
		}
		p.mesh.position.copy(startPos);
	});

	let closestToCenter = null;
	let minCenterDist = Infinity;
	players.forEach((p) => {
		if (p.team === "home" && !p.isGK) {
			const dist = p.mesh.position.distanceTo(new THREE.Vector3(0, 0, 0));
			if (dist < minCenterDist) {
				minCenterDist = dist;
				closestToCenter = p;
			}
		}
	});
	if (closestToCenter) {
		activePlayer = closestToCenter;
	}
}

function updateScoreboard() {
	document.getElementById(
		"score-display"
	).innerText = `${scores.home} - ${scores.away}`;
}

function updateLabelsAndCamera() {
	let target = activePlayer
		? activePlayer.mesh.position.clone()
		: ball.position.clone();
	if (activePlayer) target.lerp(ball.position, 0.7);
	else target = ball.position.clone();

	const camTargetPos = new THREE.Vector3(40, 80, target.z + 60);

	camera.position.lerp(camTargetPos, 0.1);

	camera.lookAt(target);

	players.forEach((p) => {
		const tempV = p.mesh.position.clone();
		tempV.y += 6.5;
		tempV.project(camera);
		const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
		const y = (-(tempV.y * 0.5) + 0.5) * window.innerHeight;

		p.div.style.left = `${x}px`;
		p.div.style.top = `${y}px`;
		p.div.style.display =
			tempV.z < 1 &&
			x > 0 &&
			x < window.innerWidth &&
			y > 0 &&
			y < window.innerHeight
				? "block"
				: "none";

		if (p === activePlayer) {
			p.marker.style.display = "block";
			p.marker.style.left = `${x}px`;
			p.marker.style.top = `${y - 12}px`;
			p.div.style.fontWeight = "800";
			p.div.style.color = "#f1c40f";
		} else {
			p.marker.style.display = "none";
			p.div.style.fontWeight = "600";
			p.div.style.color = "white";
		}
	});
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
	requestAnimationFrame(animate);

	if (gameActive) {
		updatePhysics();
		updateLabelsAndCamera();
		updateMinimap();

		if (!isGoalScored && matchStarted) {
			gameTime += 0.016;
			if (gameTime >= CONFIG.matchDuration) endGame();

			let minutes = Math.floor(gameTime / 60);
			let seconds = Math.floor(gameTime % 60);
			document.getElementById("timer").innerText = `${minutes
				.toString()
				.padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
		}
	} else {
		renderer.render(scene, camera);
	}

	if (gameActive) renderer.render(scene, camera);
}

init();
