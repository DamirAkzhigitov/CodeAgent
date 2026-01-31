import { CodeGenerator, CodeGenerationContext } from './codeGenerator.js'

/**
 * Direct test script for CodeGenerator class
 * Modify the parameters below to test with your own values
 */
async function testCodeGenerator() {
  // Initialize the generator
  const generator = new CodeGenerator()

  // ============================================
  // MODIFY THESE PARAMETERS FOR YOUR TESTING
  // ============================================

  const taskDescription = 'Create a simple hello world HTML page'

  const context: CodeGenerationContext = {
    // existingFiles: {
    //   'index.html': '<html><body>Existing content</body></html>',
    // },
    // requirements: 'Use modern CSS and make it responsive',
  }

  const branchName = 'test-branch'

  // ============================================
  // TEST CODE GENERATION
  // ============================================

  try {
    console.log('🚀 Starting code generation...')
    console.log(`Task: ${taskDescription}`)
    console.log(`Context:`, context)
    console.log('---\n')

    // Generate code
    const result = await generator.generateCode(taskDescription, context)

    console.log('✅ Code generation successful!')
    console.log(`Generated ${Object.keys(result.files).length} file(s):`)
    Object.keys(result.files).forEach(filePath => {
      console.log(`  - ${filePath}`)
    })
    console.log('\n---\n')

    // Save files (optional - uncomment to save)
    // console.log('💾 Saving files...');
    // const saveResult = await generator.saveCodeFiles(result.files, branchName);
    // console.log(`✅ Files saved to: ${saveResult.workspacePath}`);
    // console.log(`Saved ${saveResult.files.length} file(s)\n`);

    // Generate commit message (optional - uncomment to test)
    // console.log('📝 Generating commit message...');
    // const commitMessage = await generator.generateCommitMessage(taskDescription, result.files);
    // console.log(`✅ Commit message: ${commitMessage}\n`);

    // Display file contents (optional - uncomment to see content)
    // console.log('📄 File contents:');
    // Object.entries(result.files).forEach(([path, content]) => {
    //   console.log(`\n--- ${path} ---`);
    //   console.log(content);
    // });
  } catch (error) {
    console.error('❌ Error:', error)
    if (error instanceof Error) {
      console.error('Message:', error.message)
      console.error('Stack:', error.stack)
    }
  }
}

// Run the test
testCodeGenerator().catch(console.error)
