# frozen_string_literal: true

require 'bundler/inline'

gemfile do
  source 'https://rubygems.org'
  gem 'http'
  gem 'awesome_print'
end

def fetch(url)
  JSON.parse(HTTP.get(url).body.to_s)
end

namespace = 'peerDependencies'

latest_tag = fetch('https://api.github.com/repos/effect-ts/effect/releases')
             .first
             .fetch('tag_name')

upstream = fetch(
  "https://raw.githubusercontent.com/Effect-TS/effect/#{latest_tag}/package.json"
)

package_json = File.join(__dir__, 'package.json')

library = JSON.parse(IO.read(package_json))

updates = upstream.fetch('dependencies').slice(*library.fetch(namespace).keys)

updated_library = {
  **library,
  namespace => library.fetch(namespace).merge(updates)
}

IO.write(package_json, JSON.pretty_generate(updated_library))

`prettier --write #{package_json}`
