(function (root) {
  const KEY = "clockifyImportEnabled";
  root.KnowClockifySettings = {
    KEY,
    isEnabled: (value) => value !== false,
  };
})(globalThis);
