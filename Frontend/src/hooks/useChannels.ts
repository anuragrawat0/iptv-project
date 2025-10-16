import { useEffect, useState } from "react";
import { fetchChannels } from "../lib/api.ts";

export function useChannels({
  q,
  page,
  limit,
  validate = false,
  working_only = true
}: {
  q?: string;
  page?: number;
  limit?: number;
  validate?: boolean;
  working_only?: boolean;
}) {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchChannels({ q, page, limit, validate, working_only })
      .then((c) => alive && setChannels(c))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q, page, limit, validate, working_only]);

  return { channels, loading, error, setChannels };
}
