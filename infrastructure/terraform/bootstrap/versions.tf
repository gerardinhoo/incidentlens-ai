terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Bootstrap intentionally uses local state: it creates the remote-state
  # foundation that the application stack will migrate onto later.
  backend "local" {
    path = "terraform.tfstate"
  }
}
