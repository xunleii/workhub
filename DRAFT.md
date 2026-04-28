# Workhub

`Workhub` est un projet TUI, idealement ecrit en Go, pour centraliser un workflow de travail base sur des tickets et des `git worktree`.

La commande CLI retenue pour le moment est `whub`.

## Probleme a resoudre

Quand un ticket arrive, il peut concerner plusieurs repositories et donc plusieurs worktrees. Aujourd'hui, il est facile de perdre la vue d'ensemble :

- quel ticket est associe a quels dossiers
- quels worktrees existent deja localement
- quels projets doivent etre ouverts ensemble dans l'editeur

En plus, Zed permet d'ouvrir plusieurs projets dans une meme fenetre, mais ne propose pas une gestion simple et persistante de ces espaces de travail. Il faut donc fournir une experience qui recompose rapidement un contexte de travail a partir d'un ticket.

## Vision

Workhub sert de point central entre :

1. un identifiant de ticket
2. une liste de worktrees locaux associes
3. une selection des projets a ouvrir dans une nouvelle fenetre Zed

L'outil doit permettre de retrouver un contexte de travail en quelques secondes, sans recloner, sans chercher manuellement les dossiers, et sans reconstruire a la main une session d'editeur.

## Experience utilisateur cible

Flux principal envisage :

1. l'utilisateur cree ou selectionne un ticket
2. Workhub affiche les worktrees connus pour ce ticket
3. l'utilisateur peut ajouter, retirer ou marquer des dossiers
4. l'utilisateur selectionne les projets a ouvrir
5. Workhub lance une nouvelle fenetre Zed avec les dossiers choisis

Le tout doit se faire dans une interface TUI simple, rapide et agreable a utiliser.

## Fonctionnalites initiales

### 1. Gestion des tickets

- creer un ticket localement
- retrouver un ticket existant
- associer un ticket a un ou plusieurs dossiers de worktree
- voir rapidement l'etat d'un ticket et ses repertoires

### 2. Index local des worktrees

- enregistrer les chemins des worktrees connus
- rattacher un worktree a un ticket
- permettre plusieurs repositories pour un meme ticket
- detecter si un chemin n'existe plus ou est devenu invalide

### 3. Ouverture dans Zed

- afficher la liste des worktrees d'un ticket
- permettre une selection interactive
- ouvrir les dossiers selectionnes dans une nouvelle fenetre Zed
- eviter de dependre d'un mecanisme de sauvegarde natif des workspaces Zed

## Contraintes et principes

- implementation prioritaire en Go
- interface TUI des le debut
- stockage local simple et portable
- pas de dependance a un service distant dans une premiere version
- comportement explicite : un ticket mappe vers des chemins locaux

## Pistes techniques

### Langage et stack

- **Go** pour le binaire principal
- une librairie TUI de l'ecosysteme Go, par exemple Bubble Tea
- format de stockage local leger, par exemple SQLite ou JSON/YAML selon les besoins de recherche et d'evolution

### Modele de donnees minimal

Exemple conceptuel :

- `ticket`
  - `id`
  - `label`
  - `notes` optionnelles
- `worktree`
  - `path`
  - `repository`
  - `branch`
  - `ticket_id`

## Questions ouvertes

- faut-il scanner automatiquement les worktrees existants ou uniquement enregistrer ceux ajoutes manuellement ?
- faut-il stocker un ticket par identifiant brut (`ABC-123`) ou permettre des alias plus lisibles ?
- faut-il memoriser des groupes de projets frequents au-dela du ticket lui-meme ?
- comment interfacer au mieux Zed selon les capacites exactes de son CLI sur la machine cible ?

## Premier objectif de MVP

Un MVP utile pourrait permettre :

1. de creer un ticket
2. de lui associer plusieurs chemins de worktree
3. de visualiser ces chemins dans un TUI
4. d'en selectionner plusieurs
5. de les ouvrir dans une nouvelle fenetre Zed via `whub`

Si ce socle est bon, la suite pourra couvrir la decouverte automatique, les metadonnees de repository, et une meilleure ergonomie autour des tickets recurrents.
