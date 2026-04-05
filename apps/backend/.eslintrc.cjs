module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended"],
  ignorePatterns: ["dist/", "coverage/", "node_modules/", "prisma/migrations/"],
  rules: {
    "no-empty": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unused-vars": "off",
    "no-useless-escape": "off",
  },
};
