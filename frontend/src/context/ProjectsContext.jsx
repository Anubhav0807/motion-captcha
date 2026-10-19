import { createContext, useContext } from 'react';
import { api } from '../api';
import { useAsync } from '../hooks/useAsync';

const ProjectsContext = createContext(null);

/** Shared project list so every page's project filter stays in sync. */
export function ProjectsProvider({ children }) {
  const { data, loading, error, reload, setData } = useAsync(() => api.projects.list(), []);
  const projects = data || [];
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  return (
    <ProjectsContext.Provider value={{ projects, byId, loading, error, reload, setProjects: setData }}>
      {children}
    </ProjectsContext.Provider>
  );
}

export const useProjects = () => useContext(ProjectsContext);
