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
  command wh __complete workspaces 2>/dev/null
}

_wh_repositories() {
  command wh __complete repos 2>/dev/null
}

_wh_workspace_repositories() {
  local workspace_name="$1"
  [[ -n "$workspace_name" ]] || return
  command wh __complete workspace-repos "$workspace_name" 2>/dev/null
}

_wh_complete() {
  local cur prev subcommand subcommand_index workspace_index workspace_name
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local index
  subcommand_index=0
  for (( index = 1; index < COMP_CWORD; index++ )); do
    case "\${COMP_WORDS[index]}" in
      new|open|edit|delete|completion|help)
        subcommand="\${COMP_WORDS[index]}"
        subcommand_index=$index
        break
        ;;
    esac
  done

  if [[ $subcommand_index -gt 0 ]]; then
    workspace_index=$((subcommand_index + 1))
    workspace_name="\${COMP_WORDS[workspace_index]}"
  fi

  case "$prev" in
    --origins)
      COMPREPLY=( $(compgen -d -- "$cur") )
      return
      ;;
    --editor)
      COMPREPLY=( $(compgen -c -- "$cur") )
      return
      ;;
    --repo)
      compopt +o default +o bashdefault 2>/dev/null
      COMPREPLY=( $(compgen -W "$(_wh_repositories)" -- "$cur") )
      return
      ;;
    --add)
      compopt +o default +o bashdefault 2>/dev/null
      COMPREPLY=( $(compgen -W "$(_wh_repositories)" -- "$cur") )
      return
      ;;
    --remove)
      compopt +o default +o bashdefault 2>/dev/null
      COMPREPLY=( $(compgen -W "$(_wh_workspace_repositories "$workspace_name")" -- "$cur") )
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
  local -a workspaces

  workspaces=("\${(@f)$(wh __complete workspaces 2>/dev/null)}")

  compadd -a workspaces
}

_wh_repositories() {
  local -a repositories

  repositories=("\${(@f)$(wh __complete repos 2>/dev/null)}")

  compadd -a repositories
}

_wh_workspace_repositories() {
  local workspace_name=$words[3]
  local -a repositories

  [[ -n "$workspace_name" ]] || return
  repositories=("\${(@f)$(wh __complete workspace-repos "$workspace_name" 2>/dev/null)}")

  compadd -a repositories
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
            '--repo=[repository to include]:repository:_wh_repositories' \\
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
            _arguments \\
              '--add=[repository to add]:repository:_wh_repositories' \\
              '--remove=[repository to remove]:repository:_wh_workspace_repositories' \\
              '--branch=[branch name]:'
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
    command wh __complete workspaces 2>/dev/null
end

function __wh_repositories
    command wh __complete repos 2>/dev/null
end

function __wh_workspace_name
    set -l tokens (commandline -opc)
    set -l seen_edit 0

    for token in $tokens
        if test $seen_edit -eq 0
            if test "$token" = edit
                set seen_edit 1
            end
            continue
        end

        if not string match -qr '^-' -- $token
            echo $token
            return
        end
    end
end

function __wh_workspace_repositories
    set -l workspace_name (__wh_workspace_name)
    if test -n "$workspace_name"
        command wh __complete workspace-repos $workspace_name 2>/dev/null
    end
end

complete -c wh -f
complete -c wh -n '__fish_use_subcommand' -a 'new open edit delete completion help'
complete -c wh -l help -d 'Show help'
complete -c wh -l version -d 'Show version'
complete -c wh -l origins -r -a '(__fish_complete_directories)' -d 'Origins directory'
complete -c wh -l editor -x -a '(__fish_complete_command)' -d 'Editor binary'

complete -c wh -n '__fish_seen_subcommand_from new' -l repo -x -a '(__wh_repositories)' -d 'Repository to include'
complete -c wh -n '__fish_seen_subcommand_from new' -l branch -x -d 'Branch name'
complete -c wh -n '__fish_seen_subcommand_from new' -l no-open -d 'Skip opening in editor'

complete -c wh -n '__fish_seen_subcommand_from open; and __fish_is_nth_token 2' -a '(__wh_workspaces)' -d 'Workspace name'
complete -c wh -n '__fish_seen_subcommand_from open' -l status -d 'Show workspace status'

complete -c wh -n '__fish_seen_subcommand_from edit; and __fish_is_nth_token 2' -a '(__wh_workspaces)' -d 'Workspace name'
complete -c wh -n '__fish_seen_subcommand_from edit' -l add -x -a '(__wh_repositories)' -d 'Repository to add'
complete -c wh -n '__fish_seen_subcommand_from edit' -l remove -x -a '(__wh_workspace_repositories)' -d 'Repository to remove'
complete -c wh -n '__fish_seen_subcommand_from edit' -l branch -x -d 'Branch name'

complete -c wh -n '__fish_seen_subcommand_from delete; and __fish_is_nth_token 2' -a '(__wh_workspaces)' -d 'Workspace name'
complete -c wh -n '__fish_seen_subcommand_from delete' -l force -d 'Skip confirmation when safe'

complete -c wh -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish' -d 'Shell name'
`;
    default:
      throw new Error(`Unsupported shell: ${shell satisfies never}`);
  }
}
