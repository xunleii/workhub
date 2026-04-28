import { describe, expect, it } from 'vitest';

import { renderCompletionScript } from '../../../src/core/completion.js';

describe('src/core/completion', () => {
  it('renders bash completion with directory completion for --origins', () => {
    const script = renderCompletionScript('bash');

    expect(script).toContain('complete -F _wh_complete wh');
    expect(script).toContain('compgen -d');
    expect(script).toContain('--origins');
    expect(script).toContain('command wh __complete repos');
    expect(script).toContain('command wh __complete workspace-repos');
    expect(script).toContain('compopt +o default +o bashdefault');
  });

  it('renders zsh completion with _files directory completion', () => {
    const script = renderCompletionScript('zsh');

    expect(script).toContain('#compdef wh');
    expect(script).toContain('_files -/');
    expect(script).toContain('completion');
    expect(script).toContain('_wh_repositories');
    expect(script).toContain('workspace-repos');
    expect(script).toContain('compadd -a repositories');
  });

  it('renders fish completion with directory completion helpers', () => {
    const script = renderCompletionScript('fish');

    expect(script).toContain('complete -c wh -l origins -r -a \'(__fish_complete_directories)\'');
    expect(script).toContain('complete -c wh -n \'__fish_seen_subcommand_from delete\' -l force');
    expect(script).toContain('complete -c wh -n \'__fish_seen_subcommand_from new\' -l repo -r -a \'(__wh_repositories)\'');
    expect(script).toContain('complete -c wh -n \'__fish_seen_subcommand_from edit\' -l remove -r -a \'(__wh_workspace_repositories)\'');
  });
});
