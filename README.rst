.. image:: https://instaloader.github.io/assets/instaloader-logo.png
   :alt: Instaloader Logo

Instaloader
===========

.. image:: https://img.shields.io/pypi/v/instaloader.svg
   :target: https://pypi.org/project/instaloader/
.. image:: https://img.shields.io/pypi/pyversions/instaloader.svg
   :target: https://pypi.org/project/instaloader/
.. image:: https://img.shields.io/github/license/instaloader/instaloader.svg
   :target: LICENSE

Downloads public and private profiles, hashtags, user stories, feeds and saved
media,

- downloads **comments, geotags and captions** of each post,
- automatically **detects profile name changes** and renames the target directory accordingly,
- allows **fine-grained customization of filters and where to store downloaded media**,
- automatically **resumes previously-interrupted download iterations**.

Instaloader is an unofficial tool and has no affiliation with Instagram. Usage is at your own risk.

Installation
------------

.. code-block:: bash

    pip3 install instaloader

Usage
-----

To download all pictures and videos of a profile, as well as the profile picture, do

.. code-block:: bash

    instaloader profile [profile ...]

For details, see the `documentation <https://instaloader.github.io/>`__.

WorkBuddy Instagram Workbench
-----------------------------

This fork also contains an optional native WorkBuddy MCP App that wraps the existing
Instaloader engine without replacing the Python API or command-line interface. It
supports visual download task configuration, local Instaloader session files, browser
cookies, task history, results, and local-only execution. It never asks for or stores
an Instagram password.

Build from source with the committed npm lockfile:

.. code-block:: bash

    npm ci
    npm run build

To create the portable WorkBuddy staging directory used by the release workflow:

.. code-block:: bash

    npm run package:workbuddy

See `docs/INSTALL_WORKBUDDY.md <docs/INSTALL_WORKBUDDY.md>`__ for installation,
uninstallation, release-package and troubleshooting instructions, and
`docs/WORKBUDDY_WORKBENCH.md <docs/WORKBUDDY_WORKBENCH.md>`__ for architecture and
security details.
