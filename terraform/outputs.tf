output "amplify_app_id" {
  value = aws_amplify_app.skillexchange.id
}

output "amplify_default_domain" {
  value = aws_amplify_app.skillexchange.default_domain
}

output "dns_records" {
  description = "GoDaddy CNAME records to create"
  value = {
    for d in aws_amplify_domain_association.tapdot.sub_domain :
    d.prefix => d.dns_record
  }
}

output "domain_certificate_verification" {
  description = "DNS record GoDaddy needs for the ACM certificate"
  value       = aws_amplify_domain_association.tapdot.certificate_verification_dns_record
}

output "qa" {
  value = module.qa.summary
}

output "prod" {
  value = module.prod.summary
}
