/**
 * Shells supported by the built-in completion generator.
 */
export type SupportedShell = 'bash' | 'zsh' | 'fish';

/**
 * Renders the shell completion script for the requested shell.
 *
 * The generated scripts complete subcommands and options, and delegate path
 * completion for `--origins` to the native directory-completion mechanism of
 * each shell.
 *
 * @param shell - Target shell format to generate.
 * @returns The shell script content ready to be sourced or installed.
 * @throws {Error} When the shell is not supported.
 */
export function renderCompletionScript(shell: SupportedShell): string {
  switch (shell) {
    case 'bash':
      return `# bash completion for wh
_wh_workspaces() {
  local workspace_dir="\${XDG_CONFIG_HOME:-$HOME/.config}/workhub/workspaces"
  if [[ -d "$workspace_dir" ]]; then
    local file
    for file in "$workspace_dir"/*.yaml; do
      [[ -e "$file" ]] || continue
      basename "$file" .yaml
    done
  fi
}

_wh_complete() {
  local cur prev subcommand
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    --origins)
      COMPREPLY=( $(compgen -d -- "$cur") )
      return
      ;;
    --editor)
      COMPREPLY=( $(compgen -c -- "$cur") )
      return
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )
      return
      ;;
  esac

  if [[ "$cur" == --origins=* ]]; then
    local path_cur="\${cur#--origins=}"
    COMPREPLY=( $(compgen -d -- "$path_cur") )
    COMPREPLY=( "\${COMPREPLY[@]/#/--origins=}" )
    return
  fi

  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "new open edit delete completion help --help --version --origins --editor" -- "$cur") )
    return
  fi

  local index
  for (( index = 1; index < COMP_CWORD; index++ )); do
    case "\${COMP_WORDS[index]}" in
      new|open|edit|delete|completion|help)
        subcommand="\${COMP_WORDS[index]}"
        break
        ;;
    esac
  done

  case "$subcommand" in
    new)
      COMPREPLY=( $(compgen -W "--repo --branch --no-open --help" -- "$cur") )
      ;;
    open)
      if [[ $COMP_CWORD -eq 2 && "$cur" != -* ]]; then
        COMPREPLY=( $(compgen -W "$(_wh_workspaces)" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "--status --help" -- "$cur") )
      fi
      ;;
    edit)
      if [[ $COMP_CWORD -eq 2 && "$cur" != -* ]]; then
        COMPREPLY=( $(compgen -W "$(_wh_workspaces)" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "--add --remove --branch --help" -- "$cur") )
      fi
      ;;
    delete)
      if [[ $COMP_CWORD -eq 2 && "$cur" != -* ]]; then
        COMPREPLY=( $(compgen -W "$(_wh_workspaces)" -- "$cur") )
      else
        COMPREPLY=( $(compgen -W "--force --help" -- "$cur") )
      fi
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )
      ;;
    *)
      COMPREPLY=( $(compgen -W "--help --version --origins --editor" -- "$cur") )
      ;;
  esac
}

complete -F _wh_complete wh
`;
    case 'zsh':
      return `#compdef wh

_wh_workspaces() {
  local workspace_dir="\${XDG_CONFIG_HOME:-$HOME/.config}/workhub/workspaces"
  local -a workspaces

  if [[ -d "$workspace_dir" ]]; then
    workspaces=($workspace_dir/*.yaml(N:t:r))
  else
    workspaces=()
  fi

  _describe 'workspace' workspaces
}

_wh() {
  local context state line
  typeset -A opt_args

  _arguments -C \\
    '--help[show help]' \\
    '--version[show version]' \\
    '--origins=[origins directory]:directory:_files -/' \\
    '--editor=[editor binary]:editor:_command_names' \\
    '1:command:(new open edit delete completion help)' \\
    '*::arg:->args'

  case $state in
    args)
      case $words[2] in
        new)
          _arguments \\
            '1:workspace name:' \\
            '--repo=[repository to include]:' \\
            '--branch=[branch name]:' \\
            '--no-open[skip opening in editor]'
          ;;
        open)
          if (( CURRENT == 3 )) && [[ $words[CURRENT] != -* ]]; then
            _wh_workspaces
          else
            _arguments '--status[show workspace status]'
          fi
          ;;
        edit)
          if (( CURRENT == 3 )) && [[ $words[CURRENT] != -* ]]; then
            _wh_workspaces
          else
            _arguments '--add=[repository to add]:' '--remove=[repository to remove]:' '--branch=[branch name]:'
          fi
          ;;
        delete)
          if (( CURRENT == 3 )) && [[ $words[CURRENT] != -* ]]; then
            _wh_workspaces
          else
            _arguments '--force[skip confirmation when safe]'
          fi
          ;;
        completion)
          _arguments '1:shell:(bash zsh fish)'
          ;;
      esac
      ;;
  esac
}

_wh "$@"
`;
    case 'fish':
      return `function __wh_workspaces
    set -l workspace_dir (set -q XDG_CONFIG_HOME; and echo $XDG_CONFIG_HOME; or echo $HOME/.config)/workhub/workspaces
    if test -d $workspace_dir
        for file in $workspace_dir/*.yaml
            if test -e $file
                basename $file .yaml
            end
        end
    end
end

complete -c wh -f
complete -c wh -n '__fish_use_subcommand' -a 'new open edit delete completion help'
complete -c wh -l help -d 'Show help'
complete -c wh -l version -d 'Show version'
complete -c wh -l origins -r -a '(__fish_complete_directories)' -d 'Origins directory'
complete -c wh -l editor -r -a '(__fish_complete_command)' -d 'Editor binary'

complete -c wh -n '__fish_seen_subcommand_from new' -l repo -r -d 'Repository to include'
complete -c wh -n '__fish_seen_subcommand_from new' -l branch -r -d 'Branch name'
complete -c wh -n '__fish_seen_subcommand_from new' -l no-open -d 'Skip opening in editor'

complete -c wh -n '__fish_seen_subcommand_from open' -a '(__wh_workspaces)' -d 'Workspace name'
complete -c wh -n '__fish_seen_subcommand_from open' -l status -d 'Show workspace status'

complete -c wh -n '__fish_seen_subcommand_from edit' -a '(__wh_workspaces)' -d 'Workspace name'
complete -c wh -n '__fish_seen_subcommand_from edit' -l add -r -d 'Repository to add'
complete -c wh -n '__fish_seen_subcommand_from edit' -l remove -r -d 'Repository to remove'
complete -c wh -n '__fish_seen_subcommand_from edit' -l branch -r -d 'Branch name'

complete -c wh -n '__fish_seen_subcommand_from delete' -a '(__wh_workspaces)' -d 'Workspace name'
complete -c wh -n '__fish_seen_subcommand_from delete' -l force -d 'Skip confirmation when safe'

complete -c wh -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish' -d 'Shell name'
`;
    default:
      throw new Error(`Unsupported shell: ${shell satisfies never}`);
  }
}
