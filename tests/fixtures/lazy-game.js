/* A stand-in game for tests/arcade-lazy.test.js: registers when its script is loaded on demand. */
window.SamukaArcade.register("t-lazy", {
  title: "t-lazy.rb",
  blurb: "fixture",
  mount: function (stage) { stage.innerHTML = '<div class="t-lazy">mounted</div>'; return {}; }
});
