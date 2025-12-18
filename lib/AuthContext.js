import { createContext, useContext, useEffect, useState } from 'react';
import { supabaseClient } from './supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    // Check active session
    const getSession = async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      setUser(session?.user ?? null);

      if (session?.user) {
        await loadWorkspaces(session.user.id);
      }

      setLoading(false);
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);

        if (session?.user) {
          await loadWorkspaces(session.user.id);
        } else {
          setWorkspaces([]);
          setWorkspace(null);
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Load workspaces for user
  const loadWorkspaces = async (userId) => {
    try {
      const res = await fetch(`/api/workspaces?user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);

        // Restore last selected workspace from localStorage
        const savedWorkspaceId = localStorage.getItem('prover_workspace_id');
        if (savedWorkspaceId) {
          const saved = data.workspaces?.find(w => w.id === savedWorkspaceId);
          if (saved) {
            setWorkspace(saved);
          } else if (data.workspaces?.length > 0) {
            setWorkspace(data.workspaces[0]);
          }
        } else if (data.workspaces?.length > 0) {
          setWorkspace(data.workspaces[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load workspaces:', e);
    }
  };

  // Select a workspace
  const selectWorkspace = (ws) => {
    setWorkspace(ws);
    if (ws) {
      localStorage.setItem('prover_workspace_id', ws.id);
    } else {
      localStorage.removeItem('prover_workspace_id');
    }
  };

  // Sign in with email/password
  const signIn = async (email, password) => {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  // Sign up with email/password
  const signUp = async (email, password) => {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });
    if (error) throw error;
    return data;
  };

  // Sign out
  const signOut = async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    setWorkspace(null);
    setWorkspaces([]);
    localStorage.removeItem('prover_workspace_id');
  };

  // Refresh workspaces
  const refreshWorkspaces = async () => {
    if (user) {
      await loadWorkspaces(user.id);
    }
  };

  const value = {
    user,
    loading,
    workspace,
    workspaces,
    selectWorkspace,
    refreshWorkspaces,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
