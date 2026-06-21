// Onda 8 (cont.) — Manifests de LP (SPEC §10): create (rascunho) e publish (deploy). Sem segredos/PII.

export interface LandingCreateManifest {
  kind: 'landing-create';
  clientSlug: string;
  stamp: string;
  subdomain: string;
  sections: number;
  noindex: true;
}

export interface LandingPublishManifest {
  kind: 'landing-publish';
  clientSlug: string;
  stamp: string;
  subdomain: string;
  url: string | null;
  status: string;
}

export function buildCreateManifest(args: {
  clientSlug: string;
  stamp: string;
  subdomain: string;
  sections: number;
}): LandingCreateManifest {
  return {
    kind: 'landing-create',
    clientSlug: args.clientSlug,
    stamp: args.stamp,
    subdomain: args.subdomain,
    sections: args.sections,
    noindex: true,
  };
}

export function buildPublishManifest(args: {
  clientSlug: string;
  stamp: string;
  subdomain: string;
  url: string | null;
  status: string;
}): LandingPublishManifest {
  return { kind: 'landing-publish', ...args };
}

export function manifestPath(stamp: string, kind: 'landing-create' | 'landing-publish'): string {
  return `tentativas-geracao-de-campanhas/${stamp}-${kind}.json`;
}
