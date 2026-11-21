export type TabId = 'rotas' | 'enderecos' | 'localizar';

export type StopStatus = 'pendente' | 'concluida' | 'nao_entregue';

export type RouteStatus = 'planejada' | 'em_andamento' | 'finalizada';

export type UserRole = 'organizador' | 'motorista';

export interface Marmoraria {
  id: string;
  nome: string;
  cidade: string;
  telefone: string;
  lat: number;
  lng: number;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RouteStop {
  stopId: string;
  marmorariaId: string;
  nome: string;
  cidade: string;
  telefone: string;
  lat: number;
  lng: number;
  status: StopStatus;
  updatedAt?: string;
}

export interface RoutePlan {
  id: string;
  nome: string;
  stops: RouteStop[];
  status: RouteStatus;
  currentDestinationStopId: string | null;
  activeDriverName: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppTemplate {
  id: string;
  titulo: string;
  mensagem: string;
}

export interface TeamUser {
  id: string;
  name: string;
  login: string;
  role: UserRole;
  createdAt: string;
}

export interface TeamSession {
  token: string;
  teamId: string;
  teamName: string;
  teamCode: string;
  user: TeamUser;
}

export interface DriverLocation {
  userId: string;
  userName: string;
  role: UserRole;
  lat: number;
  lng: number;
  accuracy?: number;
  routeId?: string | null;
  routeName?: string | null;
  destinationName?: string | null;
  updatedAt: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}
