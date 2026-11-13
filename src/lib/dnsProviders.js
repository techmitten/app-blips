// Help pages for adding DNS records at popular domain providers, for the
// "Help for your provider" window in Publish (DnsHelpModal). Each link is the
// provider's own article; `a` / `cname` pick a record-specific page where the
// provider splits them. Checked 2026-11-13; providers move these pages, so
// re-check a link when someone reports it broken.
export const DNS_PROVIDERS = [
  { name: 'Amazon Route 53', url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html' },
  { name: 'Cloudflare', url: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/' },
  {
    name: 'Dynadot',
    a: 'https://www.dynadot.com/help/question/create-A-record',
    cname: 'https://www.dynadot.com/help/question/create-CNAME',
  },
  { name: 'Gandi', url: 'https://docs.gandi.net/en/domain_names/common_operations/dns_records.html' },
  { name: 'GoDaddy', url: 'https://www.godaddy.com/help/manage-dns-records-680' },
  { name: 'Hostinger', url: 'https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger' },
  { name: 'Hover', url: 'https://support.hover.com/support/solutions/articles/201000064728' },
  {
    name: 'IONOS',
    a: 'https://www.ionos.com/help/domains/configuring-your-ip-address/changing-a-domains-ipv4/ipv6-address-a/aaaa-record/',
    cname: 'https://www.ionos.com/help/domains/configuring-cname-records-for-subdomains/configuring-a-cname-record-for-a-subdomain/',
  },
  { name: 'Name.com', url: 'https://www.name.com/support/articles/206127137-adding-dns-records-and-templates' },
  { name: 'Namecheap', url: 'https://www.namecheap.com/support/knowledgebase/article.aspx/434/2237/how-do-i-set-up-host-records-for-a-domain/' },
  { name: 'Porkbun', url: 'https://kb.porkbun.com/article/68-how-to-edit-dns-records' },
  { name: 'Squarespace Domains', note: 'formerly Google Domains', url: 'https://support.squarespace.com/hc/en-us/articles/360002101888-Adding-custom-DNS-records-to-your-Squarespace-managed-domain' },
  { name: 'Wix', url: 'https://support.wix.com/en/article/managing-dns-records-in-your-wix-account' },
];

// The page for this provider and record type ('A' or 'CNAME').
export const providerGuideUrl = (provider, recordType) => (
  provider.url || (recordType === 'A' ? provider.a : provider.cname)
);
