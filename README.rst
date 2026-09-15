.. image:: https://raw.githubusercontent.com/instaloader/instaloader/master/docs/logo_heading.png

.. badges-start

|pypi| |pyversion| |license| |aur| |contributors| |downloads|

.. |pypi| image:: https://img.shields.io/pypi/v/instaloader.svg
   :alt: Instaloader PyPI Project Page
   :target: https://pypi.org/project/instaloader/

.. |license| image:: https://img.shields.io/github/license/instaloader/instaloader.svg
   :alt: MIT License
   :target: https://github.com/instaloader/instaloader/blob/master/LICENSE

.. |pyversion| image:: https://img.shields.io/pypi/pyversions/instaloader.svg
   :alt: Supported Python Versions

.. |contributors| image:: https://img.shields.io/github/contributors/instaloader/instaloader.svg
   :alt: Contributor Count
   :target: https://github.com/instaloader/instaloader/graphs/contributors

.. |aur| image:: https://img.shields.io/aur/version/instaloader.svg
   :alt: Arch User Repository Package
   :target: https://aur.archlinux.org/packages/instaloader/

.. |downloads| image:: https://pepy.tech/badge/instaloader/month
   :alt: PyPI Download Count
   :target: https://pepy.tech/project/instaloader

.. badges-end

::

    $ pip3 install instaloader

    $ instaloader profile [profile ...]

**Instaloader**

- downloads **public and private profiles, hashtags, user stories,
  feeds and saved media**,

- downloads **comments, geotags and captions** of each post,

- automatically **detects profile name changes** and renames the target
  directory accordingly,

- allows **fine-grained customization** of filters and where to store
  downloaded media,

- automatically **resumes previously-interrupted** download iterations.

::

    instaloader [--comments] [--geotags]
                [--stories] [--highlights] [--tagged] [--reels] [--igtv]
                [--login YOUR-USERNAME] [--fast-update]
                profile | "#hashtag" | :stories | :feed | :saved

`Instaloader Documentation <https://instaloader.github.io/>`__

WorkBuddy Instagram Download Workbench
--------------------------------------

This fork additionally contains an **optional native WorkBuddy MCP App** that
wraps the existing Instaloader engine in a local graphical workbench.  The
original Python API and ``instaloader`` CLI remain available and compatible.

The WorkBuddy layer provides a visual task builder for Profile, Hashtag,
Shortcode, Feed, Stories and Saved targets, together with content options,
filters, output rules, safe task history and structured results.

Authentication follows a password-free model: anonymous access, an existing
Instaloader session file, or browser cookies through the optional
``browser_cookie3`` integration.  The workbench does **not** provide an
Instagram password field and does not persist raw cookie/session contents.

To build it from source, Node.js 20+ is required in addition to the normal
Python requirements::

    npm install
    npm run build
    bash scripts/install-workbuddy-app.sh

Windows users can run ``scripts/install-workbuddy-app.ps1`` instead.  After
restarting WorkBuddy, enter ``打开 Instagram 下载工作台``.

See ``docs/INSTALL_WORKBUDDY.md`` for installation details and
``docs/WORKBUDDY_WORKBENCH.md`` for the architecture and security model.


How to Automatically Download Pictures from Instagram
-----------------------------------------------------

To **download all pictures and videos of a profile**, as well as the
**profile picture**, do

::

    instaloader profile [profile ...]

where ``profile`` is the name of a profile you want to download. Instead
of only one profile, you may also specify a list of profiles.

To later **update your local copy** of that profiles, you may run

::

    instaloader --fast-update profile [profile ...]

If ``--fast-update`` is given, Instaloader stops when arriving at the
first already-downloaded picture.

Alternatively, you can use ``--latest-stamps`` to have Instaloader store
the time each profile was last downloaded and only download newer media:

::

    instaloader --latest-stamps -- profile [profile ...]

With this option it's possible to move or delete downloaded media and still keep
the archive updated.

When updating profiles, Instaloader
automatically **detects profile name changes** and renames the target directory
accordingly.

Instaloader can also be used to **download private profiles**. To do so,
invoke it with

::

    instaloader --login=your_username profile [profile ...]

When logging in, Instaloader **stores the session cookies** in a file in your
temporary directory, which will be reused later the next time ``--login``
is given.  So you can download private profiles **non-interactively** when you
already have a valid session cookie file.

`Instaloader Documentation <https://instaloader.github.io/basic-usage.html>`__

Contributing
------------

As an open source project, Instaloader heavily depends on the contributions from
its community. See
`contributing <https://instaloader.github.io/contributing.html>`__
for how you may help Instaloader to become an even greater tool.

Supporters
----------

.. current-sponsors-start

| Instaloader is proudly sponsored by

.. list-table::
  :align: center

  * - |socialapis|
  * - `SocialAPIs <https://socialapis.io/?utm_source=github&utm_medium=sponsor&utm_campaign=instaloader>`__

|

.. list-table::
  :align: center

  * - `@rocketapi-io <https://github.com/rocketapi-io>`__

|

See `Alex' GitHub Sponsors <https://github.com/sponsors/aandergr>`__ page for
how you can sponsor the development of Instaloader!

.. |socialapis| image:: ./.sponsor-logos/socialapis.png
   :alt: SocialAPIs
   :target: https://socialapis.io/?utm_source=github&utm_medium=sponsor&utm_campaign=instaloader
   :height: 96px

.. current-sponsors-end

It is a pleasure for us to share our Instaloader to the world, and we are proud
to have attracted such an active and motivating community, with so many users
who share their suggestions and ideas with us. Buying a community-sponsored beer
or coffee from time to time is very likely to further raise our passion for the
development of Instaloader.

| For Donations, we provide GitHub Sponsors page, a PayPal.Me link and a Bitcoin address.
|  GitHub Sponsors: `Sponsor @aandergr on GitHub Sponsors <https://github.com/sponsors/aandergr>`__
|  PayPal: `PayPal.me/aandergr <https://www.paypal.me/aandergr>`__
|  BTC: 1Nst4LoadeYzrKjJ1DX9CpbLXBYE9RKLwY

Disclaimer
----------

.. disclaimer-start

Instaloader is in no way affiliated with, authorized, maintained or endorsed by Instagram or any of its affiliates or
subsidiaries. This is an independent and unofficial project. Use at your own risk.

Instaloader is licensed under an MIT license. Refer to ``LICENSE`` file for more information.

.. disclaimer-end
