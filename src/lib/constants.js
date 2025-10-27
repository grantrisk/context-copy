// --- Default Ignore Patterns ---
export const DEFAULT_IGNORE_PATTERNS = [
    // --- Configuration/Meta ---
    '**/.env*',
    '**/*.log',
    '**/*.swp', // Vim swap files
    '**/*.bak', // Backup files
    '**/*~', // Editor temporary files
    '**/.DS_Store',
    '**/thumbs.db', // Windows cache
    '**/Desktop.ini', // Windows metadata
    '**/*.iml', // IntelliJ IDEA module files
    // --- Dependency/Lock Files ---
    '**/yarn.lock',
    '**/package-lock.json',
    '**/Pipfile.lock', // Python lock file
    '**/go.sum', // Go lock file
    // --- Critical Build/Dependency Directories ---
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.idea/**',
    '**/coverage/**', // Test reports
    '**/tmp/**', // Temporary files
    '**/temp/**', // Temporary files
    '**/log/**', // Log directory
    '**/out/**', // Common output
    '**/target/**', // Rust/Java build output
    '**/vendor/**', // Third-party dependencies
    // --- Compiled/Generated Files/Code ---
    '**/*.min.js', // Minified JavaScript
    '**/*.pyc',
    '**/__pycache__/**', // Python cache directory
    '**/*.class', // Java compiled
    '**/*.jar', // Java archives
    '**/*.o', // Compiled objects
    '**/*.swo', // --- Binary and Archive Files (Existing) ---
    '**/*.png',
    '**/*.jpg',
    '**/*.jpeg',
    '**/*.gif',
    '**/*.ico',
    '**/*.svg',
    '**/*.webp',
    '**/*.pdf',
    '**/*.doc',
    '**/*.docx',
    '**/*.xls',
    '**/*.xlsx',
    '**/*.ppt',
    '**/*.pptx',
    '**/*.zip',
    '**/*.tar',
    '**/*.gz',
    '**/*.rar',
    '**/*.mp3',
    '**/*.mp4',
    '**/*.mov',
    '**/*.avi',
]

// --- Context Size Thresholds ---
export const CONTEXT_SIZE_THRESHOLDS = {
    low: 4000, // Safe for most models - Green
    medium: 16000, // Fits in moderate context models - Yellow
    high: 100000, // Fits in large context models - Orange
    // Over 100k tokens will be Red
}