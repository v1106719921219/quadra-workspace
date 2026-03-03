const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: {
    "popup/popup": "./src/popup/popup.ts",
    "content/psa": "./src/content/psa.ts",
    "service-worker": "./src/background/service-worker.ts",
    "options/options": "./src/options/options.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "src/popup/popup.html", to: "popup.html" },
        { from: "src/options/options.html", to: "options.html" },
        { from: "icons", to: "icons", noErrorOnMissing: true },
      ],
    }),
  ],
};
