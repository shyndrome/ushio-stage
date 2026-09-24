// ==========================================
// main.js
// ==========================================

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzqycvmQMrM9trQ8T0TXzDYvlxZH-zFZOd5iHLagp5dC77rIEBjxTxX86L_-oyDLLFRog/exec"; // 公開したGASのWebアプリURL
const TICKET_UNIT_PRICE = 1; // チケット単価

let fetchedSchedules = [];
let currentReservationId = null;
let currentFormData = {}; // グローバル変数として保持

document.addEventListener("DOMContentLoaded", () => {
  // datetimeSelect が存在する場合のみ (index.html の場合のみ) 実行
  const datetimeSelect = document.getElementById("datetimeSelect");

  if (datetimeSelect) {
    // 1. フォームの初期化（GASから公演日時と残席数を取得）
    initForm();

    // 2. イベントリスナー登録（要素が存在するかチェックして安全に登録）
    datetimeSelect.addEventListener("change", onDatetimeChange);

    const countSelect = document.getElementById("countSelect");
    if (countSelect) {
      countSelect.addEventListener("change", calculateTotal);
    }

    const submitToConfirmBtn = document.getElementById("submitToConfirmBtn");
    if (submitToConfirmBtn) {
      submitToConfirmBtn.addEventListener("click", handleStepToConfirm);
    }

    const finalSubmitBtn = document.getElementById("finalSubmitBtn");
    if (finalSubmitBtn) {
      finalSubmitBtn.addEventListener("click", handleFinalSubmit);
    }

    const cancelConfirmBtn = document.getElementById("cancelConfirmBtn");
    if (cancelConfirmBtn) {
      cancelConfirmBtn.addEventListener("click", hideConfirmScreen);
    }
  }
});

// 1. フォーム初期化・日時一覧取得
async function initForm() {
  const datetimeSelect = document.getElementById("datetimeSelect");
  const pageLoader = document.getElementById("pageLoader");
  
  try {
    const res = await fetch(GAS_API_URL);
    const data = await res.json();
    
    if (data.status === "success") {
      fetchedSchedules = data.schedules;
      datetimeSelect.innerHTML = '<option value="">公演を選択</option>';
      
      fetchedSchedules.forEach(item => {
        const option = document.createElement("option");
        option.value = item.datetime;
        
        if (item.isSelectable) {
          option.textContent = `${item.datetime}`;
        } else {
          option.textContent = `${item.datetime} (${item.statusText || "受付不可"})`;
          option.disabled = true;
        }
        
        datetimeSelect.appendChild(option);
      });
    } else {
      alert("公演データの取得に失敗しました。");
    }
  } catch (err) {
    alert("公演日時の取得に失敗しました。画面を再読み込みしてください。");
  } finally {
    // ★ 読み込み完了後にドットのローディング表示を消す
    if (pageLoader) {
      pageLoader.style.display = "none";
    }
  }
}

// 2. 日時変更時の枚数セレクトボックスの動的生成
function onDatetimeChange(e) {
  const selectedDatetime = e.target.value;
  const countSelect = document.getElementById("countSelect");
  
  // 初期化
  countSelect.innerHTML = '<option value="">枚数を選択</option>';

  // 日時未選択時は無効化
  if (!selectedDatetime) {
    countSelect.disabled = true;
    calculateTotal();
    return;
  }

  // 選択された日時のデータ（残席数含む）を特定
  const targetSched = fetchedSchedules.find(
    s => String(s.datetime).trim() === String(selectedDatetime).trim()
  );

  if (!targetSched) {
    countSelect.disabled = true;
    return;
  }

  const remainingSeats = Number(targetSched.remainingSeats) || 0;

  // 残席が0枚の場合
  if (remainingSeats <= 0) {
    countSelect.innerHTML = '<option value="">満席（残り0枚）</option>';
    countSelect.disabled = true;
    calculateTotal();
    return;
  }

  // 最大10枚、残席が10枚未満なら「残席数まで」を選択上限にする
  const maxSelectable = Math.min(10, remainingSeats);

  // 1枚 〜 maxSelectable枚 までの <option> を生成
  for (let i = 1; i <= maxSelectable; i++) {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${i}枚`;
    countSelect.appendChild(opt);
  }

  // セレクトボックスを有効化
  countSelect.disabled = false;
  calculateTotal();
}

// 合計金額の計算
function calculateTotal() {
  const count = Number(document.getElementById("countSelect").value) || 0;
  const total = count * TICKET_UNIT_PRICE;
  const priceDisplay = document.getElementById("totalPriceDisplay");
  if (priceDisplay) {
    priceDisplay.textContent = `￥${total.toLocaleString()}`;
  }
}

// 3. バリデーション ＆ 仮予約実行 (確認画面へ進む)
async function handleStepToConfirm() {
  const datetime = document.getElementById("datetimeSelect").value;
  const count = Number(document.getElementById("countSelect").value);
  const paymentMethodSelect = document.getElementById("paymentMethodSelect");
  const paymentMethod = paymentMethodSelect.value;
  const paymentMethodText = paymentMethodSelect.selectedOptions[0]?.text || "";
  const name = document.getElementById("nameInput").value.trim();
  const kana = document.getElementById("kanaInput").value.trim();
  const email = document.getElementById("emailInput").value.trim();
  const emailConfirm = document.getElementById("emailConfirmInput").value.trim();
  const remarks = document.getElementById("remarksInput").value.trim();

  // バリデーション
  if (!datetime || !count || !paymentMethod || !name || !kana || !email || !emailConfirm) {
    alert("必須項目をすべて入力・選択してください。");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert("正しいメールアドレスの形式で入力してください。");
    return;
  }
  if (email !== emailConfirm) {
    alert("メールアドレスと確認用メールアドレスが一致しません。");
    return;
  }

  // ★ 連打防止 ＆ ボタンテキスト変更
  const submitBtn = document.getElementById("submitToConfirmBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "お席を確保中...";

  // フォーム入力値をグローバル変数に保存
  currentFormData = { datetime, count, paymentMethod, paymentMethodText, name, kana, email, remarks };

  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        mode: "tentative_hold",
        ...currentFormData
      }),
      redirect: "follow"
    });

    const result = await res.json();

    if (result.status === "success") {
      currentReservationId = result.reservationId;
      showConfirmScreen(currentFormData); // 確認モーダルを表示
    } else {
      alert(result.message || "お席が確保できませんでした。");
    }
  } catch (err) {
    console.error("仮予約通信エラー:", err);
    alert("通信エラーが発生しました。もう一度お試しください。");
  } finally {
    // ★ 処理完了後にボタンを元に戻す
    submitBtn.disabled = false;
    submitBtn.textContent = "確認画面へ";
  }
}

// 4. 確認画面での最終確定処理（「予約確定」ボタン押下時）
async function handleFinalSubmit() {
  const finalBtn = document.getElementById("finalSubmitBtn");
  const cancelBtn = document.getElementById("cancelConfirmBtn");

  // ★ 連打防止（確定ボタンだけでなく戻るボタンも無効化）
  finalBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  finalBtn.textContent = "処理中（そのままお待ちください）...";

  const totalAmount = currentFormData.count * TICKET_UNIT_PRICE;

  if (currentFormData.paymentMethod === "onsite") {
    // --- 【当日精算】 ---
    try {
      const res = await fetch(GAS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          mode: "confirm_onsite",
          reservationId: currentReservationId,
          datetime: currentFormData.datetime,
          count: currentFormData.count,
          email: currentFormData.email,
          name: currentFormData.name,
          totalAmount: totalAmount
        }),
        redirect: "follow"
      });

      const result = await res.json();

      if (result.status === "success") {
        window.location.href = `confirmed.html?res_id=${currentReservationId}`;
      } else {
        alert("エラー: " + result.message);
        finalBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        finalBtn.textContent = "予約を確定する";
      }
    } catch (err) {
      console.error("当日精算通信エラー:", err);
      alert("通信エラーが発生しました。コンソールログをご確認ください。");
      finalBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      finalBtn.textContent = "予約を確定する";
    }
  } else if (currentFormData.paymentMethod === "prepayment") {
    // --- 【事前決済 (Square)】 ---
    try {
      const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
      const redirectUrl = baseUrl + "confirmed.html";

      const res = await fetch(GAS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          mode: "create_square_checkout",
          reservationId: currentReservationId,
          datetime: currentFormData.datetime,
          count: currentFormData.count,
          unitPrice: TICKET_UNIT_PRICE,
          redirectUrl: redirectUrl
        }),
        redirect: "follow"
      });

      const result = await res.json();

      if (result.status === "success" && result.checkoutUrl) {
        // Square決済ページヘリダイレクト（ボタンは無効化したまま遷移）
        window.location.href = result.checkoutUrl;
      } else {
        alert("決済URLの生成に失敗しました: " + result.message);
        finalBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        finalBtn.textContent = "予約を確定する";
      }
    } catch (err) {
      console.error("Square決済通信エラー:", err);
      alert("通信エラーが発生しました。コンソールログをご確認ください。");
      finalBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      finalBtn.textContent = "予約を確定する";
    }
  }
}

// 確認モーダルの表示制御
function showConfirmScreen(data) {
  const total = data.count * TICKET_UNIT_PRICE;
  const confirmContent = document.getElementById("confirmContent");
  if (confirmContent) {
    confirmContent.innerHTML = `
      <strong>公演日時:</strong> ${data.datetime}<br>
      <strong>枚数:</strong> ${data.count}枚<br>
      <strong>合計金額:</strong> ￥${total.toLocaleString()}<br>
      <strong>お支払い方法:</strong> ${data.paymentMethodText}<br>
      <strong>お名前:</strong> ${data.name} (${data.kana}) 様<br>
      <strong>メールアドレス:</strong> ${data.email}<br>
      <strong>備考:</strong> ${data.remarks || "なし"}
    `;
  }
  const confirmModal = document.getElementById("confirmModal");
  if (confirmModal) {
    confirmModal.style.display = "block";
  }
}

function hideConfirmScreen() {
  const confirmModal = document.getElementById("confirmModal");
  if (confirmModal) {
    confirmModal.style.display = "none";
  }
}

// 4. 確認画面での最終確定処理（「予約確定」ボタン押下時）
async function handleFinalSubmit() {
  const finalBtn = document.getElementById("finalSubmitBtn");
  finalBtn.disabled = true;
  finalBtn.textContent = "処理中...";

  const totalAmount = currentFormData.count * TICKET_UNIT_PRICE;

  if (currentFormData.paymentMethod === "onsite") {
    // --- 【当日精算】 ---
    try {
      const res = await fetch(GAS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          mode: "confirm_onsite",
          reservationId: currentReservationId,
          datetime: currentFormData.datetime,
          count: currentFormData.count,
          email: currentFormData.email,
          name: currentFormData.name,
          totalAmount: totalAmount
        }),
        redirect: "follow"
      });

      const result = await res.json();

      if (result.status === "success") {
        // confirmed.html へリダイレクト
        window.location.href = `confirmed.html?res_id=${currentReservationId}`;
      } else {
        alert("エラー: " + result.message);
        finalBtn.disabled = false;
        finalBtn.textContent = "予約を確定する";
      }
    } catch (err) {
      console.error("当日精算通信エラー:", err);
      alert("通信エラーが発生しました。コンソールログをご確認ください。");
      finalBtn.disabled = false;
      finalBtn.textContent = "予約を確定する";
    }
  } else if (currentFormData.paymentMethod === "prepayment") {
    // --- 【事前決済 (Square)】 ---
    try {
      const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
      const redirectUrl = baseUrl + "confirmed.html";

      const res = await fetch(GAS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          mode: "create_square_checkout",
          reservationId: currentReservationId,
          datetime: currentFormData.datetime,
          count: currentFormData.count,
          unitPrice: TICKET_UNIT_PRICE,
          redirectUrl: redirectUrl
        }),
        redirect: "follow"
      });

      const result = await res.json();

      if (result.status === "success" && result.checkoutUrl) {
        // Square決済ページヘリダイレクト
        window.location.href = result.checkoutUrl;
      } else {
        alert("決済URLの生成に失敗しました: " + result.message);
        finalBtn.disabled = false;
        finalBtn.textContent = "予約を確定する";
      }
    } catch (err) {
      console.error("Square決済通信エラー:", err);
      alert("通信エラーが発生しました。コンソールログをご確認ください。");
      finalBtn.disabled = false;
      finalBtn.textContent = "予約を確定する";
    }
  }
}