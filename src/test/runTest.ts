import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { FunctionSorter } from "../coreFunctionSorter.js";

interface TestCase {
  name: string;
  inputFile: string;
  expectedFile: string;
}

class FunctionSortTester {
  private testCasesDir: string;
  private functionSorter: FunctionSorter;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    this.testCasesDir = path.resolve(__dirname, "../../test-cases");
    this.functionSorter = new FunctionSorter();
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Running Function Sort Tests");
    console.log("================================");

    const testCases: TestCase[] = [
      {
        expectedFile: "basic-functions.ts",
        inputFile: "basic-functions.ts",
        name: "Basic Functions"
      },
      {
        expectedFile: "class-methods.ts",
        inputFile: "class-methods.ts",
        name: "Class Methods"
      },
      {
        expectedFile: "mixed-functions.ts",
        inputFile: "mixed-functions.ts",
        name: "Mixed Function Types"
      },
      {
        expectedFile: "complex.ts",
        inputFile: "complex.ts",
        name: "Complex Functions"
      }
    ];

    let passedTests = 0;
    let totalTests = testCases.length;

    for (const testCase of testCases) {
      try {
        console.log(`\n📋 Testing: ${testCase.name}`);
        const passed = await this.runSingleTest(testCase);
        if (passed) {
          console.log(`✅ ${testCase.name}: PASSED`);
          passedTests++;
        } else {
          console.log(`❌ ${testCase.name}: FAILED`);
        }
      } catch (error) {
        console.log(`💥 ${testCase.name}: ERROR - ${error}`);
      }
    }

    console.log("\n📊 Test Results:");
    console.log("================");
    console.log(`✅ Passed: ${passedTests}/${totalTests}`);
    console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests}`);

    if (passedTests === totalTests) {
      console.log("\n🎉 All tests passed! Your function sorter is working correctly!");
    } else {
      console.log("\n⚠️  Some tests failed.");
    }
  }

  private async runSingleTest(testCase: TestCase): Promise<boolean> {
    const inputPath = path.join(this.testCasesDir, "input", testCase.inputFile);
    const expectedPath = path.join(this.testCasesDir, "expected", testCase.expectedFile);

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    if (!fs.existsSync(expectedPath)) {
      throw new Error(`Expected file not found: ${expectedPath}`);
    }

    const inputContent = fs.readFileSync(inputPath, "utf8");
    const expectedContent = fs.readFileSync(expectedPath, "utf8");

    console.log(`   📂 Processing input...`);

    // sort the content
    const sortedContent = await this.functionSorter.sortContent(inputContent);

    // Direct comparison - no normalization
    const matches = sortedContent === expectedContent;

    if (!matches) {
      console.log(`   ❌ Content differs from expected result`);
      this.showDiff(expectedContent, sortedContent);
    } else {
      console.log(`   ✅ Content matches expected result perfectly!`);
    }

    return matches;
  }

  private showDiff(expected: string, actual: string): void {
    const expectedLines = expected.split("\n");
    const actualLines = actual.split("\n");
    const maxLines = Math.max(expectedLines.length, actualLines.length);

    console.log(`   🔍 Diff (first 5 differences):`);
    let diffCount = 0;
    for (let i = 0; i < maxLines && diffCount < 5; i++) {
      const expectedLine = expectedLines[i] || "";
      const actualLine = actualLines[i] || "";
      if (expectedLine !== actualLine) {
        console.log(`     Line ${i + 1}:`);
        console.log(`       Expected: "${expectedLine}"`);
        console.log(`       Actual:   "${actualLine}"`);
        diffCount++;
      }
    }
  }
}

// Run tests if this file is executed directly
async function main() {
  try {
    console.log("🚀 Function Sort Extension Test Suite");
    console.log("=====================================\n");

    const tester = new FunctionSortTester();
    await tester.runAllTests();
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
