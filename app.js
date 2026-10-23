
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ======================================
   1. FIREBASE 設定
====================================== */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const configured =
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let auth = null;
let db = null;

if (configured) {
  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
}

/* ======================================
   2. 角色設定
====================================== */

const ROLES = [
  {
    key: "wolf",
    name: "普通狼人",
    camp: "wolf",
    max: 20,
    icon: "🐺"
  },
  {
    key: "wolfking",
    name: "狼王",
    camp: "wolf",
    max: 1,
    icon: "👑"
  },
  {
    key: "wolfbeauty",
    name: "狼美人",
    camp: "wolf",
    max: 1,
    icon: "🌹"
  },
  {
    key: "villager",
    name: "村民",
    camp: "good",
    max: 20,
    icon: "🏡"
  },
  {
    key: "seer",
    name: "預言家",
    camp: "good",
    max: 1,
    icon: "🔮"
  },
  {
    key: "guard",
    name: "守衛",
    camp: "good",
    max: 1,
    icon: "🛡️"
  },
  {
    key: "witch",
    name: "女巫",
    camp: "good",
    max: 1,
    icon: "🧙"
  },
  {
    key: "hunter",
    name: "獵人",
    camp: "good",
    max: 1,
    icon: "🏹"
  },
  {
    key: "knight",
    name: "騎士",
    camp: "good",
    max: 1,
    icon: "⚔️"
  },
  {
    key: "bomber",
    name: "炸彈人",
    camp: "good",
    max: 1,
    icon: "💣"
  },
  {
    key: "wildchild",
    name: "野孩子",
    camp: "good",
    max: 1,
    icon: "🐾"
  }
];

const DEFAULT_COUNTS = {
  wolf: 2,
  wolfking: 1,
  wolfbeauty: 0,
  villager: 2,
  seer: 1,
  guard: 1,
  witch: 1,
  hunter: 0,
  knight: 0,
  bomber: 0,
  wildchild: 0
};

const PHASES = {
  lobby: ["🎭", "遊戲準備中", "等待玩家加入及主持人設定角色"],
  night: ["🌙", "天黑請閉眼", "所有玩家請閉眼，等待主持人完成夜間操作"],
  day: ["🌅", "天亮了", "請依照主持人指示進行白天討論"],
  voting: ["⚖️", "放逐投票", "投票已開放，請選擇你要放逐的玩家"],
  result: ["📜", "放逐結果", "本輪投票結果已經公佈"],
  ended: ["🏆", "遊戲結束", "本場狼人殺已結束"]
};

/* ======================================
   3. 狀態管理
====================================== */

const S = {
  id: null,
  room: null,
  missing: false,
  players: [],
  privateData: null,
  avatar: "",
  choice: "",
  myVote: null,
  votes: [],
  voteKey: "",
  draftCounts: null,
  draftCapacity: null,
  unsubscribeRoom: [],
  unsubscribeHost: null,
  unsubscribeVote: null,
  unsubscribeMyVote: null
};

const appRoot = document.getElementById("app");
const roomInfo = document.getElementById("room-info");

const uid = () => auth?.currentUser?.uid;

const roomRef = () => doc(db, "rooms", S.id);

const hostRef = () =>
  doc(db, "rooms", S.id, "host", "state");

const playersRef = () =>
  collection(db, "rooms", S.id, "players");

const playerRef = id =>
  doc(db, "rooms", S.id, "players", id);

const votesRef = () =>
  collection(
    db,
    "rooms",
    S.id,
    "rounds",
    String(S.room.day),
    "votes"
  );

const voteRef = () =>
  doc(
    db,
    "rooms",
    S.id,
    "rounds",
    String(S.room.day),
    "votes",
    uid()
  );

function isHost() {
  return !!S.room && S.room.hostUid === uid();
}

function me() {
  return S.players.find(p => p.id === uid());
}

function roleInfo(key) {
  return ROLES.find(r => r.key === key);
}

function getName(id) {
  return S.players.find(p => p.id === id)?.name || "未知玩家";
}

function blankNight() {
  return {
    wolfTarget: "",
    guardTarget: "",
    witchSave: false,
    poisonTarget: "",
    seerTarget: "",
    overrides: {},
    note: ""
  };
}

function safe(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}

function avatarHTML(player) {
  const valid =
    typeof player.avatar === "string" &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(player.avatar);

  if (valid) {
    return `<img class="avatar" src="${player.avatar}" alt="玩家頭像">`;
  }

  return `
    <div class="avatar avatar-placeholder">
      ${safe((player.name || "?").slice(0, 1))}
    </div>
  `;
}

function roomPlayers() {
  return [...S.players].sort((a, b) => {
    const first = a.joinedAt?.toMillis?.() ?? 0;
    const second = b.joinedAt?.toMillis?.() ?? 0;

    return first - second || a.id.localeCompare(b.id);
  });
}

function alivePlayers() {
  return roomPlayers().filter(p => p.alive);
}

function roleTotal(counts) {
  return ROLES.reduce(
    (sum, role) => sum + Number(counts[role.key] || 0),
    0
  );
}

function isWolf(key) {
  return roleInfo(key)?.camp === "wolf";
}

/* ======================================
   4. 首頁
====================================== */

function renderHome() {
  roomInfo.innerHTML = "";

  appRoot.innerHTML = `
    <section class="hero">
      <div class="moon"></div>

      <h1>月蝕之夜</h1>

      <p>
        當月亮升起，謊言與真相交錯。<br>
        誰是藏在村莊裡的狼人？
      </p>

      <button class="btn btn-primary"
        data-action="create-room">
        👑 我是主持人 · 建立房間
      </button>

      <div class="join-box">
        <p>已有房間？輸入六位房間代碼</p>

        <input
          id="join-code"
          maxlength="6"
          placeholder="例如：ABC234"
          style="text-align:center;letter-spacing:3px"
        >

        <button class="btn btn-gold btn-block"
          style="margin-top:12px"
          data-action="join-room">
          加入遊戲房間
        </button>
      </div>
    </section>
  `;
}

/* ======================================
   5. 房間建立及同步
====================================== */

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);

  return Array.from(
    bytes,
    n => chars[n % chars.length]
  ).join("");
}

async function createRoom() {
  let code;

  for (let i = 0; i < 10; i++) {
    const candidate = makeRoomCode();

    const check = await getDoc(
      doc(db, "rooms", candidate)
    );

    if (!check.exists()) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    throw new Error("無法建立唯一房間，請重試");
  }

  await setDoc(doc(db, "rooms", code), {
    hostUid: uid(),
    phase: "lobby",
    capacity: 8,
    roleCounts: DEFAULT_COUNTS,
    day: 0,
    announcement: "等待玩家加入",
    voteResult: null,
    winner: "",
    createdAt: serverTimestamp()
  });

  await setDoc(
    doc(db, "rooms", code, "host", "state"),
    {
      assignments: {},
      skills: {},
      night: blankNight(),
      history: []
    }
  );

  await enterRoom(code);
}

function clearListeners() {
  S.unsubscribeRoom.forEach(fn => fn());
  S.unsubscribeRoom = [];

  S.unsubscribeHost?.();
  S.unsubscribeVote?.();
  S.unsubscribeMyVote?.();

  S.unsubscribeHost = null;
  S.unsubscribeVote = null;
  S.unsubscribeMyVote = null;
}

async function enterRoom(rawCode) {
  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z2-9]{6}$/.test(code)) {
    throw new Error("請輸入正確的六位房間代碼");
  }

  clearListeners();

  S.id = code;
  S.room = null;
  S.players = [];
  S.privateData = null;
  S.missing = false;
  S.draftCounts = null;
  S.draftCapacity = null;
  S.choice = "";
  S.voteKey = "";
  S.votes = [];
  S.myVote = null;

  history.replaceState(
    null,
    "",
    `${location.pathname}?room=${code}`
  );

  render();

  const unsubRoom = onSnapshot(
    roomRef(),
    snapshot => {
      if (!snapshot.exists()) {
        S.missing = true;
        S.room = null;
        render();
        return;
      }

      S.missing = false;
      S.room = snapshot.data();

      if (!S.draftCounts) {
        S.draftCounts = { ...S.room.roleCounts };
      }

      if (S.draftCapacity === null) {
        S.draftCapacity = S.room.capacity;
      }

      if (isHost() && !S.unsubscribeHost) {
        S.unsubscribeHost = onSnapshot(
          hostRef(),
          hostSnapshot => {
            S.privateData = hostSnapshot.exists()
              ? hostSnapshot.data()
              : null;

            render();
          },
          handleError
        );
      }

      configureVoteListener();
      render();
    },
    handleError
  );

  const unsubPlayers = onSnapshot(
    playersRef(),
    snapshot => {
      S.players = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      render();
    },
    handleError
  );

  S.unsubscribeRoom.push(unsubRoom, unsubPlayers);
}

function configureVoteListener() {
  const shouldWatch =
    S.room?.phase === "voting" && S.room.day > 0;

  const key = shouldWatch
    ? `${S.id}-${S.room.day}-${isHost()}`
    : "";

  if (key === S.voteKey) return;

  S.unsubscribeVote?.();
  S.unsubscribeMyVote?.();

  S.unsubscribeVote = null;
  S.unsubscribeMyVote = null;

  S.voteKey = key;
  S.myVote = null;
  S.votes = [];
  S.choice = "";

  if (!shouldWatch) return;

  if (isHost()) {
    S.unsubscribeVote = onSnapshot(
      votesRef(),
      snapshot => {
        S.votes = snapshot.docs.map(item => item.data());
        render();
      },
      handleError
    );
  } else {
    S.unsubscribeMyVote = onSnapshot(
      voteRef(),
      snapshot => {
        S.myVote = snapshot.exists()
          ? snapshot.data()
          : null;

        render();
      },
      handleError
    );
  }
}

function leaveRoom() {
  clearListeners();

  S.id = null;
  S.room = null;
  S.privateData = null;

  history.replaceState(null, "", location.pathname);

  renderHome();
}

/* ======================================
   6. 玩家登記
====================================== */

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("請選擇圖片檔案"));
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      reject(new Error("圖片不得超過 10 MB"));
      return;
    }

    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = 120;
      canvas.height = 120;

      const side = Math.min(image.width, image.height);
      const x = (image.width - side) / 2;
      const y = (image.height - side) / 2;

      context.fillStyle = "#241b2b";
      context.fillRect(0, 0, 120, 120);

      context.drawImage(
        image,
        x,
        y,
        side,
        side,
        0,
        0,
        120,
        120
      );

      URL.revokeObjectURL(url);

      const result = canvas.toDataURL(
        "image/jpeg",
        0.65
      );

      if (result.length > 35000) {
        reject(new Error("頭像壓縮後仍過大"));
      } else {
        resolve(result);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("無法讀取圖片"));
    };

    image.src = url;
  });
}

async function registerPlayer() {
  if (S.room.phase !== "lobby") {
    throw new Error("遊戲開始後不能加入");
  }

  if (S.players.length >= S.room.capacity) {
    throw new Error("房間已滿");
  }

  const name = document
    .getElementById("player-name")
    .value.trim();

  if (name.length < 1 || name.length > 20) {
    throw new Error("名字請輸入 1–20 個字");
  }

  if (!S.avatar) {
    throw new Error("請先上傳你的頭像");
  }

  if (S.players.some(p => p.name === name)) {
    throw new Error("這個名字已有人使用");
  }

  await setDoc(playerRef(uid()), {
    name,
    avatar: S.avatar,
    alive: true,
    joinedAt: serverTimestamp()
  });

  S.avatar = "";
  toast("成功加入房間！");
}

/* ======================================
   7. 主持人設定
====================================== */

async function saveSettings() {
  if (!isHost() || S.room.phase !== "lobby") return;

  const capacity = Number(S.draftCapacity);
  const counts = S.draftCounts;

  if (
    !Number.isInteger(capacity) ||
    capacity < 4 ||
    capacity > 20
  ) {
    throw new Error("遊戲人數必須介於 4–20 人");
  }

  if (capacity < S.players.length) {
    throw new Error("設定人數不能少於已加入的人數");
  }

  for (const role of ROLES) {
    const count = Number(counts[role.key] || 0);

    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > role.max
    ) {
      throw new Error(`${role.name}的數量不正確`);
    }
  }

  if (roleTotal(counts) !== capacity) {
    throw new Error(
      `角色總數 ${roleTotal(counts)} 與玩家人數 ${capacity} 不一致`
    );
  }

  const wolves = ROLES
    .filter(r => r.camp === "wolf")
    .reduce((n, r) => n + Number(counts[r.key]), 0);

  if (wolves < 1 || wolves >= capacity) {
    throw new Error("必須同時具有狼人與好人陣營");
  }

  await updateDoc(roomRef(), {
    capacity,
    roleCounts: { ...counts }
  });

  toast("遊戲配置已儲存");
}

async function assignRole(playerId, role) {
  if (!isHost() || S.room.phase !== "lobby") return;

  if (role && !roleInfo(role)) {
    throw new Error("未知角色");
  }

  const assignments = {
    ...(S.privateData.assignments || {})
  };

  if (role) {
    assignments[playerId] = role;
  } else {
    delete assignments[playerId];
  }

  await updateDoc(hostRef(), { assignments });
}

async function removePlayer(playerId) {
  if (!isHost() || S.room.phase !== "lobby") return;

  if (!confirm(`確定移除 ${getName(playerId)}？`)) {
    return;
  }

  await deleteDoc(playerRef(playerId));

  const assignments = {
    ...(S.privateData.assignments || {})
  };

  delete assignments[playerId];

  await updateDoc(hostRef(), { assignments });
}

async function startGame() {
  if (!isHost() || S.room.phase !== "lobby") return;

  const counts = S.room.roleCounts;
  const assignments = S.privateData.assignments || {};

  if (S.players.length !== S.room.capacity) {
    throw new Error(
      `需要 ${S.room.capacity} 人，目前只有 ${S.players.length} 人`
    );
  }

  if (roleTotal(counts) !== S.room.capacity) {
    throw new Error("角色數量與玩家人數不一致");
  }

  const used = {};

  for (const player of S.players) {
    const role = assignments[player.id];

    if (!roleInfo(role)) {
      throw new Error(`${player.name} 尚未設定身分`);
    }

    used[role] = (used[role] || 0) + 1;
  }

  for (const role of ROLES) {
    if (
      (used[role.key] || 0) !==
      Number(counts[role.key] || 0)
    ) {
      throw new Error(
        `${role.name}的實際分配與設定數量不一致`
      );
    }
  }

  if (!confirm("確認所有玩家都已抽牌，開始第一夜？")) {
    return;
  }

  const batch = writeBatch(db);

  batch.update(roomRef(), {
    phase: "night",
    day: 1,
    announcement: "第 1 夜，天黑請閉眼",
    voteResult: null,
    winner: ""
  });

  batch.update(hostRef(), {
    night: blankNight(),
    skills: {},
    history: []
  });

  await batch.commit();
}

/* ======================================
   8. 夜間行動
====================================== */

function computeNightDeaths() {
  const night = S.privateData?.night || blankNight();
  const living = new Set(alivePlayers().map(p => p.id));
  const deaths = new Set();

  if (
    night.wolfTarget &&
    living.has(night.wolfTarget) &&
    night.wolfTarget !== night.guardTarget &&
    !night.witchSave
  ) {
    deaths.add(night.wolfTarget);
  }

  if (
    night.poisonTarget &&
    living.has(night.poisonTarget)
  ) {
    deaths.add(night.poisonTarget);
  }

  for (const [id, status] of Object.entries(
    night.overrides || {}
  )) {
    if (!living.has(id)) continue;

    if (status === "kill") deaths.add(id);
    if (status === "save") deaths.delete(id);
  }

  return [...deaths];
}

async function endNight() {
  if (!isHost() || S.room.phase !== "night") return;

  const deaths = computeNightDeaths();

  const description = deaths.length
    ? `昨夜死亡：${deaths.map(getName).join("、")}`
    : "昨夜是平安夜，無人死亡";

  if (
    !confirm(
      `${description}\n\n確定天亮並公開死亡結果？`
    )
  ) return;

  const batch = writeBatch(db);

  for (const id of deaths) {
    batch.update(playerRef(id), {
      alive: false
    });
  }

  batch.update(roomRef(), {
    phase: "day",
    announcement: description
  });

  const history = [
    ...(S.privateData.history || []),
    {
      day: S.room.day,
      type: "night",
      detail: description
    }
  ].slice(-80);

  batch.update(hostRef(), {
    history
  });

  await batch.commit();
}

/* ======================================
   9. 技能紀錄
====================================== */

async function recordSkill(playerId) {
  if (!isHost()) return;

  const role = S.privateData.assignments?.[playerId];
  const roleName = roleInfo(role)?.name || "未知角色";

  const label = prompt(
    `玩家：${getName(playerId)}\n` +
    `角色：${roleName}\n\n` +
    "請輸入使用的技能名稱：\n" +
    "例如：女巫解藥、獵人開槍、狼美人魅惑"
  );

  if (!label?.trim()) return;

  if (label.trim().length > 40) {
    throw new Error("技能名稱不得超過 40 字");
  }

  const skills = {
    ...(S.privateData.skills || {})
  };

  skills[playerId] = [
    ...(skills[playerId] || []),
    {
      label: label.trim(),
      day: S.room.day,
      phase: S.room.phase
    }
  ].slice(-30);

  await updateDoc(hostRef(), { skills });

  toast("技能使用紀錄已保存");
}

async function undoSkill(playerId) {
  if (!isHost()) return;

  const skills = {
    ...(S.privateData.skills || {})
  };

  if (!skills[playerId]?.length) return;

  if (!confirm("撤銷該玩家最近一筆技能紀錄？")) {
    return;
  }

  skills[playerId] = skills[playerId].slice(0, -1);

  await updateDoc(hostRef(), { skills });
}

/* ======================================
   10. 白天、死亡狀態
====================================== */

async function toggleAlive(playerId) {
  if (!isHost()) return;

  if (
    !["day", "result", "ended"].includes(S.room.phase)
  ) {
    throw new Error("夜間請使用夜間死亡設定");
  }

  const player = S.players.find(p => p.id === playerId);
  if (!player) return;

  const next = !player.alive;

  if (
    !confirm(
      `${next ? "復活" : "標記死亡"}：${player.name}？`
    )
  ) return;

  await updateDoc(playerRef(playerId), {
    alive: next
  });

  toast("玩家狀態已更新");
}

async function startVoting() {
  if (!isHost() || S.room.phase !== "day") return;

  if (!alivePlayers().length) {
    throw new Error("沒有可投票的存活玩家");
  }

  await updateDoc(roomRef(), {
    phase: "voting",
    announcement: `第 ${S.room.day} 天投票正式開始`
  });
}

/* ======================================
   11. 玩家投票
====================================== */

async function submitVote() {
  if (S.room.phase !== "voting") {
    throw new Error("現在不是投票時間");
  }

  if (!me()?.alive) {
    throw new Error("只有存活的正式玩家可以投票");
  }

  if (S.myVote) {
    throw new Error("本輪已經投過票");
  }

  if (
    !S.choice ||
    !alivePlayers().some(p => p.id === S.choice)
  ) {
    throw new Error("請選擇有效的投票對象");
  }

  if (!confirm(`確定投給 ${getName(S.choice)}？`)) {
    return;
  }

  await setDoc(voteRef(), {
    voterId: uid(),
    candidateId: S.choice,
    createdAt: serverTimestamp()
  });

  toast("投票成功，等待主持人公佈結果");
}

/* ======================================
   12. 主持人結算投票
====================================== */

function tallyVotes(votes) {
  const tally = {};

  for (const player of S.players) {
    tally[player.id] = 0;
  }

  for (const vote of votes) {
    if (
      Object.prototype.hasOwnProperty.call(
        tally,
        vote.candidateId
      )
    ) {
      tally[vote.candidateId]++;
    }
  }

  return tally;
}

async function closeVoting() {
  if (!isHost() || S.room.phase !== "voting") return;

  const voteSnapshot = await getDocs(votesRef());
  const votes = voteSnapshot.docs.map(d => d.data());

  const tally = tallyVotes(votes);
  const total = votes.length;
  const highest = Math.max(0, ...Object.values(tally));

  const winners = highest
    ? Object.keys(tally).filter(
        id => tally[id] === highest
      )
    : [];

  let announcement;
  let eliminated = "";

  if (highest === 0) {
    announcement = "本輪無有效票，無人被放逐";
  } else if (winners.length > 1) {
    announcement =
      `平票：${winners.map(getName).join("、")}` +
      "，由主持人依遊戲規則決定後續處置";
  } else {
    eliminated = winners[0];

    announcement =
      `${getName(eliminated)} 獲得 ${highest} 票，` +
      "被投票放逐";
  }

  if (
    !confirm(
      `共收到 ${total} 張選票。\n` +
      `${announcement}\n\n確定公布？`
    )
  ) return;

  const batch = writeBatch(db);

  if (eliminated) {
    batch.update(playerRef(eliminated), {
      alive: false
    });
  }

  batch.update(roomRef(), {
    phase: "result",
    announcement,
    voteResult: {
      day: S.room.day,
      tally,
      total,
      highest,
      winners,
      eliminated
    }
  });

  await batch.commit();
}

/* ======================================
   13. 下一夜及遊戲結束
====================================== */

async function nextNight() {
  if (!isHost() || S.room.phase !== "result") return;

  const nextDay = S.room.day + 1;

  const batch = writeBatch(db);

  batch.update(roomRef(), {
    phase: "night",
    day: nextDay,
    announcement: `第 ${nextDay} 夜，天黑請閉眼`,
    voteResult: null
  });

  batch.update(hostRef(), {
    night: blankNight()
  });

  await batch.commit();
}

async function endGame(winner) {
  if (!isHost()) return;

  const label =
    winner === "wolf" ? "狼人陣營" :
    winner === "good" ? "好人陣營" :
    "遊戲結束，勝負由主持人決定";

  if (!confirm(`確定宣布 ${label}？`)) return;

  await updateDoc(roomRef(), {
    phase: "ended",
    winner,
    announcement:
      winner === "none"
        ? label
        : `🏆 ${label}獲得勝利！`
  });
}

async function resetGame() {
  if (!isHost() || S.room.phase !== "ended") return;

  if (
    !confirm(
      "確定重新開局？全部玩家會復活，" +
      "角色及技能紀錄將被清除。"
    )
  ) return;

  const batch = writeBatch(db);

  S.players.forEach(player => {
    batch.update(playerRef(player.id), {
      alive: true
    });
  });

  batch.update(roomRef(), {
    phase: "lobby",
    day: 0,
    announcement: "新的一局，等待主持人設定",
    voteResult: null,
    winner: ""
  });

  batch.update(hostRef(), {
    assignments: {},
    skills: {},
    night: blankNight(),
    history: []
  });

  await batch.commit();
}

/* ======================================
   14. 畫面元件
====================================== */

function phaseBanner() {
  const [symbol, title, subtitle] =
    PHASES[S.room.phase] || PHASES.lobby;

  return `
    <section class="phase-banner ${S.room.phase}">
      <div class="phase-symbol">${symbol}</div>

      <h1>${title}</h1>

      <p>${subtitle}</p>

      ${
        S.room.day > 0
          ? `<p class="gold">第 ${S.room.day} 天</p>`
          : ""
      }

      <div class="notice">
        ${safe(S.room.announcement)}
      </div>
    </section>
  `;
}

function statsHTML() {
  return `
    <div class="stat-row">
      <div class="stat">
        <strong>${S.players.length}/${S.room.capacity}</strong>
        <span>玩家人數</span>
      </div>

      <div class="stat">
        <strong>${alivePlayers().length}</strong>
        <span>存活玩家</span>
      </div>

      <div class="stat">
        <strong>${S.players.filter(p => !p.alive).length}</strong>
        <span>死亡玩家</span>
      </div>
    </div>
  `;
}

function playerCards() {
  if (!S.players.length) {
    return `<p class="muted center">尚無玩家加入</p>`;
  }

  return `
    <div class="players">
      ${roomPlayers().map((player, index) => `
        <div class="player-card ${player.alive ? "" : "dead"}">
          <div class="player-number">
            ${index + 1} 號玩家
          </div>

          ${avatarHTML(player)}

          <div class="player-name">
            ${safe(player.name)}
          </div>

          <div class="status">
            ${player.alive ? "● 存活" : "✕ 已死亡"}
          </div>

          ${
            player.id === uid()
              ? `<div class="small gold">你自己</div>`
              : ""
          }

          ${
            isHost() && S.privateData
              ? `
                <div class="small gold">
                  ${safe(
                    roleInfo(
                      S.privateData.assignments?.[player.id]
                    )?.name || "未分配角色"
                  )}
                </div>
              `
              : ""
          }
        </div>
      `).join("")}
    </div>
  `;
}

function registrationHTML() {
  if (isHost()) return "";

  if (me()) {
    return `
      <section class="panel">
        <h2>✅ 已加入遊戲</h2>
        <p>玩家：${safe(me().name)}</p>
        <p class="muted small">
          等待主持人完成角色設定。
          身分卡由現場實體抽取，網站不會自動發牌。
        </p>
      </section>
    `;
  }

  if (S.room.phase !== "lobby") {
    return `
      <section class="panel">
        <h2>觀戰模式</h2>
        <p class="muted">遊戲已開始，現在不能加入玩家名單。</p>
      </section>
    `;
  }

  if (S.players.length >= S.room.capacity) {
    return `
      <section class="panel">
        <h2>房間已滿</h2>
        <p class="muted">請等待主持人操作。</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h2>🐺 加入狼人殺</h2>

      <label for="player-name">玩家名字</label>
      <input
        id="player-name"
        maxlength="20"
        placeholder="輸入你的名字"
      >

      <label for="avatar-input">上傳玩家頭像</label>
      <input
        id="avatar-input"
        type="file"
        accept="image/*"
      >

      <img
        id="avatar-preview"
        class="preview"
        alt="頭像預覽"
        style="display:none"
      >

      <p class="muted small">
        頭像將自動裁切及壓縮，房間中的玩家可以看見。
      </p>

      <button
        class="btn btn-gold btn-block"
        data-action="register"
      >
        確認加入
      </button>
    </section>
  `;
}

/* ======================================
   15. 投票與結果畫面
====================================== */

function votingHTML() {
  if (S.room.phase !== "voting") return "";

  let content = "";

  if (isHost()) {
    content = `
      <div class="notice">
        已收到 <b>${S.votes.length}</b> 張選票。
        投票尚未公開，僅主持人可查看。
      </div>
    `;
  } else if (!me()?.alive) {
    content = `
      <div class="notice">
        你不是存活中的正式玩家，無法投票。
      </div>
    `;
  } else if (S.myVote) {
    content = `
      <div class="notice center">
        ✅ 你已完成投票。<br>
        等待主持人宣布結果。
      </div>
    `;
  } else {
    content = `
      <p class="muted">
        每名存活玩家限投一票，提交後不能修改。
      </p>

      <div class="players">
        ${alivePlayers().map(player => `
          <button
            type="button"
            class="player-card vote-card
              ${S.choice === player.id ? "selected" : ""}"
            style="color:var(--text)"
            data-action="pick-vote"
            data-id="${player.id}"
          >
            ${avatarHTML(player)}
            <div class="player-name">
              ${safe(player.name)}
            </div>
            <div class="status">
              ${S.choice === player.id ? "✓ 已選擇" : "點擊選擇"}
            </div>
          </button>
        `).join("")}
      </div>

      <div class="button-row">
        <button
          class="btn btn-primary btn-block"
          data-action="submit-vote"
          ${S.choice ? "" : "disabled"}
        >
          確認送出選票
        </button>
      </div>
    `;
  }

  return `
    <section class="panel">
      <h2>⚖️ 放逐投票</h2>
      ${content}
    </section>
  `;
}

function resultHTML() {
  const result = S.room.voteResult;

  if (!result || S.room.phase !== "result") {
    return "";
  }

  const maximum = Math.max(
    1,
    ...Object.values(result.tally)
  );

  const rows = roomPlayers()
    .map(player => ({
      player,
      votes: result.tally[player.id] || 0
    }))
    .sort((a, b) => b.votes - a.votes);

  return `
    <section class="panel">
      <h2>📊 第 ${result.day} 天投票結果</h2>

      <p>總投票數：${result.total}</p>

      ${rows.map(row => `
        <div class="result-row">
          <span>${safe(row.player.name)}</span>

          <div class="bar">
            <div
              class="bar-fill"
              style="width:${row.votes / maximum * 100}%"
            ></div>
          </div>

          <strong>${row.votes} 票</strong>
        </div>
      `).join("")}

      <div class="notice">
        ${safe(S.room.announcement)}
      </div>
    </section>
  `;
}

/* ======================================
   16. 主持人：準備階段
====================================== */

function setupPanel() {
  const total = roleTotal(S.draftCounts);

  const roleInputs = ROLES.map(role => `
    <div class="role-row">
      <label class="${role.camp === "wolf" ? "role-wolf" : "role-good"}">
        ${role.icon} ${role.name}
      </label>

      <input
        type="number"
        min="0"
        max="${role.max}"
        value="${S.draftCounts[role.key] || 0}"
        data-count="${role.key}"
      >
    </div>
  `).join("");

  const assigned = S.privateData.assignments || {};

  return `
    <section class="panel">
      <h2>👑 主持人控制台</h2>

      <h3>遊戲人數</h3>

      <input
        type="number"
        min="4"
        max="20"
        value="${S.draftCapacity}"
        id="capacity-input"
      >

      <h3 style="margin-top:20px">狼人陣營與好人陣營</h3>

      ${roleInputs}

      <div class="notice">
        角色總數：
        <strong>${total}</strong> /
        ${S.draftCapacity} 人

        ${
          total !== Number(S.draftCapacity)
            ? `<span class="danger-text">（數量不一致）</span>`
            : `<span class="green">（數量正確）</span>`
        }
      </div>

      <button
        class="btn btn-gold btn-block"
        data-action="save-settings"
      >
        儲存玩家人數與角色配置
      </button>
    </section>

    <section class="panel">
      <h2>🎭 實體抽牌身分登記</h2>

      <p class="muted small">
        玩家在現場抽實體牌。主持人再手動選擇每位玩家的角色。
        這份身分表只有主持人可以查看。
      </p>

      ${roomPlayers().map(player => `
        <div class="admin-player">
          <div>
            <div class="admin-name">
              ${safe(player.name)}
            </div>

            <button
              class="btn btn-small btn-outline"
              style="margin-top:6px"
              data-action="remove-player"
              data-id="${player.id}"
            >
              移除
            </button>
          </div>

          <select data-role="${player.id}">
            <option value="">選擇身分</option>

            ${ROLES.map(role => `
              <option
                value="${role.key}"
                ${assigned[player.id] === role.key ? "selected" : ""}
              >
                ${role.name}
              </option>
            `).join("")}
          </select>
        </div>
      `).join("")}

      <button
        class="btn btn-primary btn-block"
        style="margin-top:25px"
        data-action="start-game"
      >
        🌙 確認身分 · 開始遊戲
      </button>
    </section>
  `;
}

/* ======================================
   17. 主持人：夜間控制
====================================== */

function aliveOptions(selected) {
  return `
    <option value="">— 無 / 未選擇 —</option>

    ${alivePlayers().map(player => `
      <option
        value="${player.id}"
        ${selected === player.id ? "selected" : ""}
      >
        ${safe(player.name)}
      </option>
    `).join("")}
  `;
}

function nightPanel() {
  const night = S.privateData.night || blankNight();
  const predicted = computeNightDeaths();

  return `
    <section class="panel">
      <h2>🌙 夜間主持人操作</h2>

      <div class="notice warning">
        這個區域只有主持人可以看到。
        夜間操作不會立即公開死亡結果。
      </div>

      <label>🐺 狼人今晚擊殺誰？</label>
      <select data-night="wolfTarget">
        ${aliveOptions(night.wolfTarget)}
      </select>

      <label>🛡️ 守衛今晚守護誰？</label>
      <select data-night="guardTarget">
        ${aliveOptions(night.guardTarget)}
      </select>

      <label>🧙 女巫是否使用解藥？</label>
      <div class="notice">
        <label>
          <input
            type="checkbox"
            data-night="witchSave"
            ${night.witchSave ? "checked" : ""}
          >
          救活今晚被狼人擊殺的玩家
        </label>
      </div>

      <label>☠️ 女巫毒殺誰？</label>
      <select data-night="poisonTarget">
        ${aliveOptions(night.poisonTarget)}
      </select>

      <label>🔮 預言家今晚查驗誰？</label>
      <select data-night="seerTarget">
        ${aliveOptions(night.seerTarget)}
      </select>

      <h3 style="margin-top:25px">
        手動修正死亡結果
      </h3>

      <p class="muted small">
        例如獵人、狼王、狼美人或特殊技能造成的額外死亡，
        可以在此手動指定。主持人以實際遊戲規則為準。
      </p>

      ${alivePlayers().map(player => `
        <div class="admin-player">
          <div class="admin-name">
            ${safe(player.name)}
          </div>

          <select data-override="${player.id}">
            <option value=""
              ${!night.overrides?.[player.id] ? "selected" : ""}>
              自動判定
            </option>

            <option value="kill"
              ${night.overrides?.[player.id] === "kill" ? "selected" : ""}>
              指定死亡
            </option>

            <option value="save"
              ${night.overrides?.[player.id] === "save" ? "selected" : ""}>
              指定存活
            </option>
          </select>
        </div>
      `).join("")}

      <h3 style="margin-top:25px">預計夜間結果</h3>

      <div class="notice">
        ${
          predicted.length
            ? `預計死亡：${safe(predicted.map(getName).join("、"))}`
            : "平安夜：預計無人死亡"
        }
      </div>

      <p class="muted small">
        預設判定：守衛守護或女巫解藥可阻止狼人擊殺；
        女巫毒藥另行造成死亡。特殊板子規則請手動修正。
      </p>

      <button
        class="btn btn-gold btn-block"
        data-action="end-night"
      >
        🌅 天亮 · 公布夜間結果
      </button>
    </section>
  `;
}

/* ======================================
   18. 主持人：技能、存活、投票
====================================== */

function skillPanel() {
  const assigned = S.privateData.assignments || {};
  const skills = S.privateData.skills || {};

  return `
    <section class="panel">
      <h2>✨ 技能使用紀錄</h2>

      <p class="muted small">
        主持人手動紀錄使用過的技能。
        本系統不會自動消耗技能次數或強制特殊角色規則。
      </p>

      ${roomPlayers().map(player => {
        const records = skills[player.id] || [];
        const role = roleInfo(assigned[player.id]);

        return `
          <div style="border-bottom:1px solid #493746;padding:12px 0">
            <div class="admin-name">
              ${safe(player.name)}
              <span class="gold">
                （${safe(role?.name || "未設定")}）
              </span>
            </div>

            <div class="skill-list">
              ${
                records.length
                  ? records.map(x =>
                      `第${x.day}天：${safe(x.label)}`
                    ).join(" / ")
                  : "尚無技能紀錄"
              }
            </div>

            <div class="button-row">
              <button
                class="btn btn-small btn-green"
                data-action="record-skill"
                data-id="${player.id}"
              >
                + 記錄技能
              </button>

              <button
                class="btn btn-small btn-outline"
                data-action="undo-skill"
                data-id="${player.id}"
                ${records.length ? "" : "disabled"}
              >
                撤銷最近紀錄
              </button>
            </div>
          </div>
        `;
      }).join("")}
    </section>
  `;
}

function lifePanel() {
  return `
    <section class="panel">
      <h2>☠️ 玩家生死管理</h2>

      <p class="muted small">
        主持人可手動調整死亡或復活狀態。
        更動會同步顯示給全部玩家。
      </p>

      ${roomPlayers().map(player => `
        <div class="admin-player">
          <div>
            <strong>${safe(player.name)}</strong>
            <div class="${player.alive ? "green" : "danger-text"} small">
              ${player.alive ? "存活" : "死亡"}
            </div>
          </div>

          <button
            class="btn btn-small ${player.alive ? "btn-danger" : "btn-green"}"
            data-action="toggle-alive"
            data-id="${player.id}"
          >
            ${player.alive ? "標記死亡" : "設為存活"}
          </button>
        </div>
      `).join("")}
    </section>
  `;
}

function votingAdminPanel() {
  const tally = tallyVotes(S.votes);

  return `
    <section class="panel">
      <h2>⚖️ 投票控制</h2>

      <p>
        已收到
        <strong class="gold">${S.votes.length}</strong>
        張選票
      </p>

      ${roomPlayers().map(player => `
        <div class="role-row">
          <span>${safe(player.name)}</span>
          <strong>${tally[player.id] || 0} 票</strong>
        </div>
      `).join("")}

      <p class="muted small" style="margin-top:14px">
        這是主持人即時統計，投票結束前不會公開給玩家。
      </p>

      <button
        class="btn btn-primary btn-block"
        data-action="close-voting"
      >
        📜 結束投票 · 公布結果
      </button>
    </section>
  `;
}

function hostControls() {
  if (!S.privateData) {
    return `
      <section class="panel">
        正在讀取主持人控制台...
      </section>
    `;
  }

  let sections = "";

  switch (S.room.phase) {
    case "lobby":
      sections = setupPanel();
      break;

    case "night":
      sections = nightPanel() + skillPanel();
      break;

    case "day":
      sections = `
        <section class="panel">
          <h2>🌅 白天主持人控制</h2>

          <p class="muted">
            完成玩家發言及討論後，主持人可以開放投票。
          </p>

          <button
            class="btn btn-primary btn-block"
            data-action="start-voting"
          >
            ⚖️ 正式開始投票
          </button>
        </section>
      ` + lifePanel() + skillPanel();
      break;

    case "voting":
      sections = votingAdminPanel() + skillPanel();
      break;

    case "result":
      sections = `
        <section class="panel">
          <h2>📜 結算完成</h2>

          <p class="muted">
            投票結果已公開，可以處理其他死亡或技能效果。
          </p>

          <button
            class="btn btn-gold btn-block"
            data-action="next-night"
          >
            🌙 進入下一夜
          </button>
        </section>
      ` + lifePanel() + skillPanel();
      break;

    case "ended":
      sections = `
        <section class="panel">
          <h2>🏆 結束控制</h2>

          <button
            class="btn btn-gold btn-block"
            data-action="reset-game"
          >
            🔄 原班玩家重新開局
          </button>
        </section>
      ` + lifePanel();
      break;
  }

  if (!["lobby", "ended"].includes(S.room.phase)) {
    sections += `
      <section class="panel">
        <h2>🏁 宣布遊戲勝負</h2>

        <button
          class="btn btn-primary btn-block"
          data-action="end-wolf"
        >
          🐺 狼人陣營勝利
        </button>

        <button
          class="btn btn-green btn-block"
          style="margin-top:10px"
          data-action="end-good"
        >
          🏡 好人陣營勝利
        </button>

        <button
          class="btn btn-outline btn-block"
          style="margin-top:10px"
          data-action="end-none"
        >
          手動結束遊戲
        </button>
      </section>
    `;
  }

  return sections;
}

/* ======================================
   19. 主畫面
====================================== */

function render() {
  if (!configured) {
    appRoot.innerHTML = `
      <section class="panel">
        <h2>需要設定 Firebase</h2>
        <p>
          請先到 app.js 填入 Firebase 專案設定，
          並開啟 Anonymous Authentication 和 Firestore。
        </p>
      </section>
    `;
    return;
  }

  if (!S.id) {
    renderHome();
    return;
  }

  if (S.missing) {
    appRoot.innerHTML = `
      <section class="panel center">
        <h2>找不到這個房間</h2>
        <p>請確認房間代碼正確。</p>

        <button class="btn" data-action="leave-room">
          返回首頁
        </button>
      </section>
    `;
    return;
  }

  if (!S.room) {
    appRoot.innerHTML =
      `<div class="loading">正在連線遊戲房間...</div>`;
    return;
  }

  roomInfo.innerHTML = `
    <div class="room-tag">
      <span>房間</span>
      <span class="room-code">${safe(S.id)}</span>

      <button
        class="btn btn-small btn-outline"
        data-action="copy-link"
      >
        分享
      </button>

      <button
        class="btn btn-small btn-outline"
        data-action="leave-room"
      >
        離開
      </button>
    </div>
  `;

  const publicContent = `
    ${phaseBanner()}
    ${statsHTML()}

    ${registrationHTML()}

    ${votingHTML()}
    ${resultHTML()}

    <section class="panel">
      <div class="panel-header">
        <h2>🎭 玩家名單</h2>
        <span class="muted small">
          ${S.players.length} 位玩家
        </span>
      </div>

      ${playerCards()}
    </section>
  `;

  appRoot.innerHTML = isHost()
    ? `
      <div class="layout">
        <div>${publicContent}</div>
        <aside>${hostControls()}</aside>
      </div>
    `
    : `
      <div class="layout-wide">
        ${publicContent}
      </div>
    `;
}

/* ======================================
   20. 事件處理
====================================== */

async function handleAction(action, button) {
  const id = button.dataset.id;

  switch (action) {
    case "create-room":
      await createRoom();
      break;

    case "join-room":
      await enterRoom(
        document.getElementById("join-code").value
      );
      break;

    case "leave-room":
      leaveRoom();
      break;

    case "copy-link": {
      const link =
        `${location.origin}${location.pathname}?room=${S.id}`;

      try {
        await navigator.clipboard.writeText(link);
        toast("房間連結已複製");
      } catch {
        prompt("複製這個房間連結：", link);
      }
      break;
    }

    case "register":
      await registerPlayer();
      break;

    case "save-settings":
      await saveSettings();
      break;

    case "remove-player":
      await removePlayer(id);
      break;

    case "start-game":
      await startGame();
      break;

    case "end-night":
      await endNight();
      break;

    case "record-skill":
      await recordSkill(id);
      break;

    case "undo-skill":
      await undoSkill(id);
      break;

    case "toggle-alive":
      await toggleAlive(id);
      break;

    case "start-voting":
      await startVoting();
      break;

    case "pick-vote":
      S.choice = id;
      render();
      break;

    case "submit-vote":
      await submitVote();
      break;

    case "close-voting":
      await closeVoting();
      break;

    case "next-night":
      await nextNight();
      break;

    case "end-wolf":
      await endGame("wolf");
      break;

    case "end-good":
      await endGame("good");
      break;

    case "end-none":
      await endGame("none");
      break;

    case "reset-game":
      await resetGame();
      break;
  }
}

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.disabled) return;

  const action = button.dataset.action;
  button.disabled = true;

  try {
    await handleAction(action, button);
  } catch (error) {
    handleError(error);
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("change", async event => {
  const target = event.target;

  try {
    if (target.id === "avatar-input") {
      const file = target.files?.[0];
      if (!file) return;

      S.avatar = await resizePhoto(file);

      const preview =
        document.getElementById("avatar-preview");

      if (preview) {
        preview.src = S.avatar;
        preview.style.display = "block";
      }

      toast("頭像上傳完成");
      return;
    }

    if (target.id === "capacity-input") {
      S.draftCapacity = Number(target.value);
      render();
      return;
    }

    if (target.dataset.count) {
      S.draftCounts[target.dataset.count] =
        Number(target.value);

      render();
      return;
    }

    if (target.dataset.role) {
      await assignRole(
        target.dataset.role,
        target.value
      );
      return;
    }

    if (target.dataset.night) {
      if (!isHost() || !S.privateData) return;

      const night = {
        ...blankNight(),
        ...(S.privateData.night || {})
      };

      const field = target.dataset.night;

      night[field] =
        target.type === "checkbox"
          ? target.checked
          : target.value;

      await updateDoc(hostRef(), { night });
      return;
    }

    if (target.dataset.override) {
      if (!isHost() || !S.privateData) return;

      const night = {
        ...blankNight(),
        ...(S.privateData.night || {})
      };

      night.overrides = {
        ...(night.overrides || {})
      };

      const playerId = target.dataset.override;

      if (target.value) {
        night.overrides[playerId] = target.value;
      } else {
        delete night.overrides[playerId];
      }

      await updateDoc(hostRef(), { night });
    }
  } catch (error) {
    handleError(error);
  }
});

function handleError(error) {
  console.error(error);

  const messages = {
    "permission-denied":
      "權限不足，請檢查 Firebase 安全規則",
    "auth/unauthorized-domain":
      "請在 Firebase 授權網域加入 GitHub Pages 網址",
    "auth/operation-not-allowed":
      "請先啟用 Firebase Anonymous Authentication",
    "unavailable":
      "網路暫時無法連線"
  };

  toast(
    messages[error.code] ||
    error.message ||
    "操作失敗，請稍後重試"
  );
}

/* ======================================
   21. 初始化
====================================== */

async function initialize() {
  if (!configured) {
    render();
    return;
  }

  try {
    await signInAnonymously(auth);

    const code = new URLSearchParams(
      location.search
    ).get("room");

    if (code) {
      await enterRoom(code);
    } else {
      renderHome();
    }
  } catch (error) {
    handleError(error);

    appRoot.innerHTML = `
      <section class="panel">
        <h2>連線失敗</h2>
        <p>請檢查 Firebase 設定、授權網域及網路連線。</p>
      </section>
    `;
  }
}

initialize();
