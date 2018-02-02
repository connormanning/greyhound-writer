# Greyhound Writer

This is a sample REPL that exercises the PDAL [Greyhound writer](https://github.com/PDAL/PDAL/blob/master/doc/stages/writers.greyhound.rst).  It allows a user to easily split up the execution of an arbitrary series of PDAL filters across a user-defined tiling scheme and instantly visualize the result in a web browser.

# Usage

Git and docker-compose are required to follow these instructions.

### Index data

First, index some data with Entwine.  We'll assume that `~/entwine` is the root location for Entwine-indexed data.

```
docker run -it -v ~/entwine:/entwine connormanning/entwine build \
    -i https://entwine.io/sample-data/autzen.laz \
    -o /entwine/autzen
```

### Launch Greyhound development environment

```
git clone https://github.com/connormanning/greyhound-writer
cd greyhound-writer
ENTWINE=~/entwine docker-compose up -d
```

Now there is a Greyhound container running as well as a container that can execute the greyhound-writer script.  Greyhound's logs can now be viewed with `docker-compose logs -f`.

We can make sure Greyhound is hooked up to our data properly by browsing to [http://speck.ly/?s=localhost:8080&r=autzen](http://speck.ly/?s=localhost:8080&r=autzen).

### Run some filtering algorithms

We'll run some ground classifier using PDAL's [SMRF](https://www.pdal.io/stages/filters.smrf.html) and [PMF](https://www.pdal.io/stages/filters.pmf.html) filters, and their results will be written back to the Greyhound resource.

Check out the [example pipeline](example.json) to see the filter portion that will be executed.  We will run each of the ground classifiers, and after each one runs we will ferry the `Classification` attribute over to new user-defined attributes that will be pushed to the resource.  By default, the data will be split up into a 6x6 grid.

We will use the Docker container named `writer` which was launched by our `docker-compose` earlier.  The current directory, containing `example.json`, is mapped to `/data` within the container (see the docker-compose file).

```
docker exec -it writer write \
    -r autzen \
    -p /data/example.json \
    -n Example
```

This invocation, with the provided `example.json`, will create three new attributes named `Example/Tile`, `Example/Smrf`, and `Example/Pmf`.  Since we passed only the resource name `autzen` rather than the full server path, the script expanded this out to the default server `http://greyhound:8080/resource/autzen` (see `docker-compose.yml`).  Now we can browse to speck.ly's "Color Channels" pane and visualize our new attributes [here](http://speck.ly/?s=localhost:8080&r=autzen).

There should now be a directory called `pipelines/Example` containing the constituent PDAL pipelines for this run of filtering.

### Going further

The `example.json` filter pipeline has some special `NAME` characters within the dimension names.  Any instance of `NAME` within the pipeline (`-p`) will be replaced with the value of the `-n` flag.

You can see the other options with:

```
docker exec -it writer write --help
```

Some notable options:

- `-s`: Number of steps in the grid system, `-s 8` uses an 8x8 grid for 64 total tiles
- `-b`: Bloat tile bounds to eliminate edge effects, `-b 0.10` bloats tiles by 10%
- `-j`: Set number of concurrent pipelines to run
- `--norun`: Generate the PDAL pipeline files, but don't execute them

