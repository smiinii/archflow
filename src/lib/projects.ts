import { emptyGraph, uid, type Project, type Workspace } from "./model";

export const newProject = (name = "새 프로젝트"): Project => ({
  id: uid(),
  name,
  folderId: null,
  graph: emptyGraph(),
  interview: "",
  versions: [],
});

export function moveProject(
  workspace: Workspace,
  projectId: string,
  folderId: string | null,
  target?: { id: string; after: boolean },
): Workspace {
  const project = workspace.projects.find((p) => p.id === projectId);
  if (
    !project ||
    (folderId && !workspace.folders.some((f) => f.id === folderId)) ||
    target?.id === projectId
  )
    return workspace;
  const projects = workspace.projects.filter((p) => p.id !== projectId);
  let index = projects.length;
  if (target) {
    index = projects.findIndex(
      (p) => p.id === target.id && p.folderId === folderId,
    );
    if (index < 0) return workspace;
    if (target.after) index++;
  } else {
    const last = projects.map((p) => p.folderId === folderId).lastIndexOf(true);
    if (last >= 0) index = last + 1;
  }
  projects.splice(index, 0, { ...project, folderId });
  if (
    projects.every(
      (p, i) =>
        p.id === workspace.projects[i].id &&
        p.folderId === workspace.projects[i].folderId,
    )
  )
    return workspace;
  return { ...workspace, projects };
}

export function deleteProject(
  workspace: Workspace,
  id: string,
  fallback: Project,
): Workspace {
  const index = workspace.projects.findIndex((p) => p.id === id);
  if (index < 0) return workspace;
  const projects = workspace.projects.filter((p) => p.id !== id);
  if (!projects.length) projects.push(fallback);
  return {
    ...workspace,
    projects,
    currentProjectId:
      workspace.currentProjectId === id
        ? projects[Math.min(index, projects.length - 1)].id
        : workspace.currentProjectId,
  };
}

export function restoreProject(
  workspace: Workspace,
  project: Project,
  index: number,
  fallback: Project | null,
): Workspace {
  if (workspace.projects.some((p) => p.id === project.id)) return workspace;
  // Remove only the untouched empty canvas created by deleting the last project.
  // Any edits made since deletion belong to the user and must survive undo.
  const projects = workspace.projects.filter(
    (p) =>
      !(
        fallback &&
        p.id === fallback.id &&
        JSON.stringify(p) === JSON.stringify(fallback)
      ),
  );
  if (projects.length >= 100) return workspace;
  const folderId = workspace.folders.some((f) => f.id === project.folderId)
    ? project.folderId
    : null;
  projects.splice(Math.min(index, projects.length), 0, {
    ...project,
    folderId,
  });
  return { ...workspace, projects, currentProjectId: project.id };
}
