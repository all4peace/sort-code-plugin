interface TestCase {
  name: string;
  inputFile: string;
  expectedFile: string;
}

function helperFunction() {
  return "helper";
}

class FunctionSortTester {
  private functionSorter: CodeSorter;
  private outputDir: string;
  private testCasesDir: string;

  constructor() {
    this.testCasesDir = path.resolve(__dirname, "../../test-cases");
    this.functionSorter = new CodeSorter();
    this.outputDir = path.join(this.testCasesDir, "output");
  }

  async runAllTests(): Promise<void> {
    console.log("Running tests");
  }

  private discoverTestCases(): TestCase[] {
    return [];
  }

  private async runSingleTest(testCase: TestCase): Promise<boolean> {
    return true;
  }
}

export { FunctionSortTester, TestCase };
