#!/usr/bin/env node
/**
 * Copyright (c) Example. Licensed under MIT.
 */

"use strict";

/* eslint-disable no-console */

function zed(): void {
  console.log("z");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function alpha(x: any): void {
  console.log(x);
}

//#region Startup
zed();
alpha(1);
//#endregion

//#region Helpers
function helperZ(): void {}
function helperA(): void {}
//#endregion
