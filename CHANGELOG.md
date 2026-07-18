# [2.17.0](https://github.com/so5/ssh-client-wrapper/compare/v2.16.0...v2.17.0) (2026-07-18)


### Bug Fixes

* fall back to package.json diff when dependabot update-type is null ([7f4cb14](https://github.com/so5/ssh-client-wrapper/commit/7f4cb14845d5f318c160e39d53be8b33b0989288))
* fall back to package.json diff when dependabot update-type is null ([632b4ec](https://github.com/so5/ssh-client-wrapper/commit/632b4ec9363564d246d7912a460812e4e5641d7a))
* match dependabot/snyk bot logins as reported by gh pr list --json ([b3555bb](https://github.com/so5/ssh-client-wrapper/commit/b3555bbbc78d8356d36688f05fd2e6f3f9055122))
* proactively update PR branch before enabling auto-merge ([a75be03](https://github.com/so5/ssh-client-wrapper/commit/a75be032e1929cc01fc02ed891650862e4eaef47))
* use admin PAT for release checkout so branch protection doesn't block it ([a8a5c5e](https://github.com/so5/ssh-client-wrapper/commit/a8a5c5e29b5ed31150722f64600ec6d810d93527))


### Features

* auto-approve and auto-merge patch/minor bot dependency PRs ([2c35c94](https://github.com/so5/ssh-client-wrapper/commit/2c35c94c0158591bc2c36395a68933de292874f7))
* include package/version details in Slack major-update notice ([e02df44](https://github.com/so5/ssh-client-wrapper/commit/e02df4404538435badbf828c343f8d275615afda))
* periodically unstick behind bot PRs with auto-merge enabled ([bdd055a](https://github.com/so5/ssh-client-wrapper/commit/bdd055a5be8f7ff47768477c675aeceae8f33640))

# [2.16.0](https://github.com/so5/ssh-client-wrapper/compare/v2.15.0...v2.16.0) (2026-07-18)


### Bug Fixes

* force single @semantic-release/npm version via overrides ([957f3a2](https://github.com/so5/ssh-client-wrapper/commit/957f3a2cd0fe5288f1c6d92c67ee1ba3864d91a7))
* pin npm upgrade to v11 in release workflow ([3d1e186](https://github.com/so5/ssh-client-wrapper/commit/3d1e18625d7f747164372548b9fe34a976e631e8))
* run semantic-release directly instead of via cycjimmy action ([3a14e44](https://github.com/so5/ssh-client-wrapper/commit/3a14e4406247937043eefe3e65736b29e77ea82b))


### Features

* make rsync retryable exit codes configurable for send/recv ([427d503](https://github.com/so5/ssh-client-wrapper/commit/427d503d936fb7d360c1e46acd99a29a6c6ec728))

# [2.15.0](https://github.com/so5/ssh-client-wrapper/compare/v2.14.0...v2.15.0) (2026-03-02)


### Bug Fixes

* package.json & package-lock.json to reduce vulnerabilities ([#31](https://github.com/so5/ssh-client-wrapper/issues/31)) ([2bbcc65](https://github.com/so5/ssh-client-wrapper/commit/2bbcc654e64edd3711ec0b43eb2eb9c7891632bf))


### Features

* enable remoteToRemoteCopy tests in GitHub Actions ([ae24386](https://github.com/so5/ssh-client-wrapper/commit/ae24386d823789f6a5acf352dcbac3d54f1aa6e7))
* remove keyFile prop before wrong password test ([b508b84](https://github.com/so5/ssh-client-wrapper/commit/b508b84edd7f6250f4e12b71190bfc56576eca81))

# [2.14.0](https://github.com/so5/ssh-client-wrapper/compare/v2.13.2...v2.14.0) (2025-11-06)


### Features

* Add TypeScript definitions and .npmignore ([#28](https://github.com/so5/ssh-client-wrapper/issues/28)) ([c65a9d0](https://github.com/so5/ssh-client-wrapper/commit/c65a9d04c3737614a488d6f4b12fe5f9a72da62d))

## [2.13.2](https://github.com/so5/ssh-client-wrapper/compare/v2.13.1...v2.13.2) (2025-11-04)


### Bug Fixes

* upgrade debug from 4.4.1 to 4.4.3 ([787706c](https://github.com/so5/ssh-client-wrapper/commit/787706ce2ee5f1144e1d5ccb2e11b06c498df0dd))

## [2.13.1](https://github.com/so5/ssh-client-wrapper/compare/v2.13.0...v2.13.1) (2025-08-20)


### Bug Fixes

* Update Code Climate workflow trigger ([7cf0a93](https://github.com/so5/ssh-client-wrapper/commit/7cf0a93913ceef762c267cb3a947c176479ce068))

# [2.13.0](https://github.com/so5/ssh-client-wrapper/compare/v2.12.4...v2.13.0) (2025-08-20)


### Bug Fixes

* upgrade debug from 4.4.0 to 4.4.1 ([35f966a](https://github.com/so5/ssh-client-wrapper/commit/35f966a7212d6bb9677964688bb94ae06f869ada))


### Features

* Improve DX and automate releases ([805f2ea](https://github.com/so5/ssh-client-wrapper/commit/805f2ea7756f6ad61238a4a21d86575a17e748d9))
* Rewrite in ESM ([c5a95c1](https://github.com/so5/ssh-client-wrapper/commit/c5a95c18401e7b373249d3707609f2a9576f7400))
* Rewrite in ESM ([71ed6f5](https://github.com/so5/ssh-client-wrapper/commit/71ed6f56af43cac1471cbf4a4ed3016f7e55ab4d))
