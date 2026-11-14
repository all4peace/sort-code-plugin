#!/usr/bin/env node
/**
 * Copyright (c) Example. Licensed under MIT.
 */

"use strict";

/* eslint-disable no-console */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function alpha(x: any): void {
  console.log(x);
}

function zed(): void {
  console.log("z");
}

//#region Startup
zed();
alpha(1);
//#endregion

//#region Helpers
function helperA(): void {}
function helperZ(): void {}
//#endregion
