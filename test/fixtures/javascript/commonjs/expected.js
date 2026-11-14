"use strict";

const path = require("path");

const config = { zed, alpha };

function alpha() {
  return zed();
}

function zed() {
  return path.join("a", "z");
}

module.exports = config;

function early() {}
function late() {}

exports.late = late;
