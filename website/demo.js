const walkthrough = document.querySelector("#walkthrough");

walkthrough.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const step = button.hasAttribute("data-reset")
    ? "1"
    : button.dataset.step ?? button.dataset.advance ?? walkthrough.dataset.step;
  const translated = button.hasAttribute("data-translate");

  walkthrough.dataset.step = step;
  walkthrough.dataset.translated = String(translated);
  walkthrough.querySelectorAll(".step").forEach((control) => {
    control.setAttribute("aria-pressed", String(control.dataset.step === step));
  });
  walkthrough.querySelector(".settings-scene").hidden = step !== "1";
  walkthrough.querySelector(".article-scene").hidden = step === "1";
  walkthrough.querySelector(".toolbar-icon").disabled = step !== "2";
  walkthrough.querySelector(".article-region").disabled = step !== "3" || translated;
  walkthrough.querySelector("[data-reset]").hidden = !translated;
  walkthrough.querySelector("#demo-status").textContent = translated
    ? "原文保留，译文紧随其后。就这样，接着读。"
    : {
        1: "01 / 先填入 API Key，再点击“保存设置”。",
        2: "02 / 网页打开后，点击右上角的橙色扩展图标。",
        3: "03 / 点击紫色框中的文章，查看中文译文。",
      }[step];

  if (button.hasAttribute("data-advance") || translated) {
    const nextControl = translated
      ? walkthrough.querySelector("[data-reset]")
      : step === "2"
        ? walkthrough.querySelector(".toolbar-icon")
        : walkthrough.querySelector(".article-region");
    nextControl.focus({ preventScroll: true });
  }
});
