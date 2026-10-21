import { useState, type DragEvent } from "react";
import {
  Folder,
  GripVertical,
  Trash2,
  Workflow,
  CornerUpLeft,
} from "lucide-react";
import type { Workspace } from "../lib/model";

const dragType = "application/x-archflow-project";
export function ProjectTree(p: {
  workspace: Workspace;
  folderId: string | null;
  selectFolder: (id: string | null) => void;
  selectProject: (id: string) => void;
  deleteProject: (id: string) => void;
  moveProject: (
    id: string,
    folder: string | null,
    target?: { id: string; after: boolean },
  ) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState("");
  function dragOver(e: DragEvent, key: string) {
    if (!dragged || !e.dataTransfer.types.includes(dragType)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setOver(key);
  }
  function drop(
    e: DragEvent,
    folder: string | null,
    target?: { id: string; after: boolean },
  ) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(dragType);
    if (id === dragged) p.moveProject(id, folder, target);
    setDragged(null);
    setOver("");
  }
  function tree(parent: string | null, depth = 0): React.ReactNode {
    return (
      <>
        {p.workspace.folders
          .filter((f) => f.parentId === parent)
          .map((f) => (
            <div className="folder-block" key={f.id}>
              <button
                className={`directory-row folder-drop ${p.folderId === f.id ? "current" : ""} ${over === f.id ? "drop-folder" : ""}`}
                style={{ paddingLeft: 10 + depth * 12 }}
                onClick={() => p.selectFolder(f.id)}
                onDragOver={(e) => dragOver(e, f.id)}
                onDrop={(e) => drop(e, f.id)}
                title={dragged ? "이 폴더에 놓아 이동" : f.name}
              >
                <Folder size={15} />
                <span>{f.name}</span>
              </button>
              {tree(f.id, depth + 1)}
            </div>
          ))}
        {p.workspace.projects
          .filter((project) => project.folderId === parent)
          .map((project) => (
            <div
              key={project.id}
              className={`project-tree-row ${project.id === p.workspace.currentProjectId ? "active" : ""} ${dragged === project.id ? "dragging" : ""} ${over.startsWith(project.id + ":") ? "drop-" + over.split(":")[1] : ""}`}
              style={{ paddingLeft: 6 + depth * 12 }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(dragType, project.id);
                e.dataTransfer.effectAllowed = "move";
                setDragged(project.id);
              }}
              onDragEnd={() => {
                setDragged(null);
                setOver("");
              }}
              onDragOver={(e) => {
                if (dragged !== project.id)
                  dragOver(
                    e,
                    project.id +
                      (e.clientY >
                      e.currentTarget.getBoundingClientRect().top +
                        e.currentTarget.offsetHeight / 2
                        ? ":after"
                        : ":before"),
                  );
              }}
              onDrop={(e) =>
                drop(e, parent, {
                  id: project.id,
                  after:
                    e.clientY >
                    e.currentTarget.getBoundingClientRect().top +
                      e.currentTarget.offsetHeight / 2,
                })
              }
              aria-label={`${project.name} 프로젝트 행`}
            >
              <GripVertical
                size={13}
                className="project-drag-handle"
                aria-hidden="true"
              />
              <button
                className="project-open"
                aria-current={
                  project.id === p.workspace.currentProjectId
                    ? "page"
                    : undefined
                }
                onClick={() => p.selectProject(project.id)}
                title={`${project.name} · 끌어서 이동`}
              >
                <Workflow size={14} />
                <span>{project.name}</span>
              </button>
              <button
                className="project-delete"
                aria-label={`${project.name} 프로젝트 삭제`}
                title="프로젝트 삭제"
                onClick={() => p.deleteProject(project.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
      </>
    );
  }
  return (
    <div
      className={"project-tree-content " + (dragged ? "is-dragging" : "")}
      data-project-controls
    >
      {tree(null)}
      <button
        className={`project-root-drop ${over === "root" ? "drop-folder" : ""}`}
        onClick={() => p.selectFolder(null)}
        onDragOver={(e) => dragOver(e, "root")}
        onDrop={(e) => drop(e, null)}
        title="프로젝트를 여기에 놓으면 폴더 밖으로 이동합니다."
      >
        <CornerUpLeft size={13} />
        {dragged ? "여기에 놓아 폴더 밖으로 이동" : "폴더 밖으로 이동"}
      </button>
      <p className="project-drag-help">끌어서 폴더 이동 · 위아래로 순서 변경</p>
    </div>
  );
}
