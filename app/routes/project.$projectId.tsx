import { ProjectView } from '~/components/ProjectView';
import { AuthRequired } from '~/components/AuthRequired';

export default function ProjectRoute() {
  return (
    <AuthRequired message="Please log in to view this project">
      <ProjectView />
    </AuthRequired>
  );
} 