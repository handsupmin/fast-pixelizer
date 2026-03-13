import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: { prettier: prettierPlugin },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  {
    ignores: ['dist/**'],
  },
)
