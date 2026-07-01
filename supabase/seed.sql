-- Onda 1 — Seed: um cliente de template (SPEC-000 §6). Idempotente para sobreviver a db reset.
-- Placeholders do template (trocar pelos seus depois): slug cliente-exemplo, domínio example.com.

insert into public.clients (slug, name, default_landing_url, daily_budget_cap_cents, currency, materials_path)
values (
  'cliente-exemplo',
  'Cliente Exemplo',
  'https://cliente-exemplo.example.com',
  5000,
  'BRL',
  '.claude/materiais-das-empresas/cliente-exemplo'
)
on conflict (slug) do nothing;

-- Produto de template (brief como jsonb — fonte da verdade lida pela skill de LP). client_id resolvido
-- pelo slug do cliente (o id é gerado dinamicamente). Idempotente por (client_id, slug).
insert into public.products (client_id, slug, name, brief, default_subdomain, status)
select
  c.id,
  'curso-exemplo',
  'Curso Exemplo de Tráfego',
  jsonb_build_object(
    'slug', 'curso-exemplo',
    'name', 'Curso Exemplo de Tráfego',
    'audience', 'Infoprodutores e pequenos negócios que querem escalar vendas com Meta Ads sem depender de agência.',
    'valueProps', jsonb_build_array(
      'Método validado em centenas de campanhas reais',
      'Templates de campanha prontos para copiar e publicar',
      'Acompanhamento da estrutura conta → campanha → conjunto → anúncio',
      'Comunidade e bônus de apoio'
    ),
    'tone', 'direto, confiante e prático, sem jargão vazio',
    'landingUrl', 'https://centralizaaigroup.org/',
    'priceCents', 19700,
    'currency', 'BRL',
    'defaultSubdomain', 'curso-exemplo'
  ),
  'curso-exemplo',
  'ready'
from public.clients c
where c.slug = 'cliente-exemplo'
on conflict (client_id, slug) do nothing;
