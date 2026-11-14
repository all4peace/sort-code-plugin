import * as fs from "fs";
import * as path from "path";

import { CodeSorter } from "../sort.js";

interface TestCase {
  name: string;
  inputFile: string;
  expectedFile: string;
}

// Run tests if this file is executed directly
async function main() {
  try {
    console.log("🚀 Function Sort Extension Test Suite");
    console.log("=====================================\n");

    const tester = new FunctionSortTester();

    // Check for command line arguments
    const args = process.argv.slice(2);
    const filenameIndex = args.indexOf("--filename");

    if (filenameIndex !== -1 && filenameIndex + 1 < args.length) {
      const filename = args[filenameIndex + 1];
      await tester.runSingleTestByFilename(filename);
    } else {
      await tester.runAllTests();
    }
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

class FunctionSortTester {
  private testCasesDir: string;
  private functionSorter: CodeSorter;

  constructor() {
    this.testCasesDir = path.resolve(__dirname, "../../test-cases");
    this.functionSorter = new CodeSorter();
  }

  async runSingleTestByFilename(filename: string): Promise<void> {
    console.log(`🧪 Running Single Test: ${filename}`);
    console.log("================================");

    const testCases = this.discoverTestCases();
    const testCase = testCases.find(tc => tc.inputFile === filename);

    if (!testCase) {
      console.log(`❌ Test file not found: ${filename}`);
      console.log(`Available test files:`);
      testCases.forEach(tc => console.log(`   - ${tc.inputFile}`));
      return;
    }

    try {
      console.log(`\n📋 Testing: ${testCase.name}`);
      const passed = await this.runSingleTest(testCase);
      if (passed) {
        console.log(`✅ ${testCase.name}: PASSED`);
      } else {
        console.log(`❌ ${testCase.name}: FAILED`);
      }
    } catch (error) {
      console.log(`💥 ${testCase.name}: ERROR - ${error}`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Running Function Sort Tests");
    console.log("================================");

    // Automatically discover test cases from input folder
    const testCases = this.discoverTestCases();

    if (testCases.length === 0) {
      console.log("❌ No test files found in test-cases/input/ folder");
      return;
    }

    console.log(`📁 Found ${testCases.length} test file(s):`);
    testCases.forEach((test: TestCase) => console.log(`   - ${test.name}`));
    console.log();

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
      console.log("\n🎉 All tests passed! Function sorter is working correctly!");
    } else {
      console.log("\n⚠️  Some tests failed.");
    }
  }

  private discoverTestCases(): TestCase[] {
    const inputDir = path.join(this.testCasesDir, "input");

    if (!fs.existsSync(inputDir)) {
      console.log(`❌ Input directory not found: ${inputDir}`);
      return [];
    }

    const files = fs.readdirSync(inputDir);
    const testFiles = files.filter(
      file => file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".mjs")
    );

    return testFiles.map(file => ({
      expectedFile: file,
      inputFile: file,
      name: file
        .replace(/\.(ts|tsx|js|mjs)$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, l => l.toUpperCase())
    }));
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

    const sortedContent = await this.functionSorter.sortContent(inputContent);

    // Save the reorganized content to output folder for comparison
    const tempOutputPath = path.join(this.testCasesDir, "output", testCase.inputFile);
    fs.writeFileSync(tempOutputPath, sortedContent, "utf8");

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

main();
